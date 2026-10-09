import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Queue } from 'bullmq';
import mongoose from 'mongoose';
import type { StringValue } from 'ms';
import ms from 'ms';
import { createHash, randomUUID } from 'node:crypto';
import {
  MAIL_QUEUE,
  WELCOME_JOB,
  welcomeJobOptions,
} from '../mail/mail.constants';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';

const SALT_ROUNDS = 12;
// With Redis unreachable, queue.add() does not fail: it waits for the
// connection to come back, which would freeze every signup. Past this long
// signup stops waiting and carries on. The add itself stays pending in the
// Redis client: if Redis returns while this process is still running, the job
// is added then and the email goes out late; if the process stops first, it
// is lost.
export const ENQUEUE_TIMEOUT_MS = 2000;

type RefreshPayload = { sub?: string; type?: string; exp?: number };

// Only this hash is stored, never the token: a database leak then does not hand
// out working sessions. SHA-256 is enough (no salt, no bcrypt) because the input
// is a signed JWT carrying a random jti, not a guessable password.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;
  private readonly mailMode: 'queue' | 'sync';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    config: ConfigService,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
    private readonly mailService: MailService,
  ) {
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshExpiresIn = config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    this.mailMode = config.get<'queue' | 'sync'>('MAIL_MODE', 'queue');
  }

  private signAccessToken(user: { _id: unknown; email: string; role: string }) {
    return this.jwtService.sign({
      sub: user._id,
      email: user.email,
      role: user.role,
    });
  }

  // Own secret and lifetime, passed per call so the one JwtService (and the
  // access-token settings it was registered with) stays untouched. The jti makes
  // two tokens issued in the same second differ, so each login gets its own
  // hash and logging out one device cannot revoke another's.
  private async issueRefreshToken(userId: unknown) {
    const refreshToken = this.jwtService.sign(
      { sub: String(userId), type: 'refresh', jti: randomUUID() },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn as StringValue,
      },
    );
    const lifetimeMs = ms(this.refreshExpiresIn as StringValue);
    return {
      refreshToken,
      hash: hashToken(refreshToken),
      refreshExpiresAt: Date.now() + lifetimeMs,
    };
  }

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    // Hashing happens here (not a schema pre-save hook) so an unrelated
    // profile update can never accidentally re-hash the password.
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // role is never passed from dto — always defaults to 'user' in UsersService.
    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
    });
    await this.sendWelcomeEmail(user);

    return user; // passwordHash stripped automatically via schema's toJSON
  }

  // The account already exists at this point, so what happens to the welcome
  // email must not decide whether signup succeeds.
  private async sendWelcomeEmail(user: {
    _id: unknown;
    email: string;
    fullName: string;
  }): Promise<void> {
    if (this.mailMode === 'sync') {
      // Measurement only (MAIL_MODE=sync): signup waits for the SMTP call and
      // fails when it fails. This is the "before" case the queue replaces.
      await this.mailService.sendWelcome(user.email, user.fullName);
      return;
    }

    const userId = String(user._id);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.mailQueue.add(WELCOME_JOB, { userId }, welcomeJobOptions(userId)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`queue did not answer in ${ENQUEUE_TIMEOUT_MS} ms`),
              ),
            ENQUEUE_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      // Redis unreachable: the user still gets their account; the welcome
      // email is late at best (see ENQUEUE_TIMEOUT_MS). The user's address is
      // not logged, only their id.
      this.logger.error(
        `Could not queue the welcome email for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Same generic error whether the user doesn't exist or the password
    // is wrong — prevents attackers from enumerating valid emails.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.signAccessToken(user);
    const { refreshToken, hash, refreshExpiresAt } =
      await this.issueRefreshToken(user._id);
    await this.usersService.addRefreshHash(String(user._id), hash);

    return { accessToken, refreshToken, refreshExpiresAt, user };
  }

  // Trades a valid refresh token for a new access token. Every way it can fail
  // gives the same 401, so a caller cannot tell a forged token from an expired,
  // revoked or evicted one. The token is not rotated: it stays valid, so two
  // tabs refreshing at once cannot invalidate each other.
  async refresh(refreshToken: string | undefined) {
    const invalid = () => new UnauthorizedException('Invalid refresh token');
    if (!refreshToken) throw invalid();

    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        refreshToken,
        { secret: this.refreshSecret },
      );
    } catch {
      throw invalid(); // bad signature, malformed, or expired
    }
    if (payload.type !== 'refresh' || !payload.sub || !payload.exp) {
      throw invalid();
    }

    // Signature and expiry alone are not enough: logout, eviction by a sixth
    // login and a credential change all remove the hash, and that must end the
    // session even though the token itself has not expired.
    const live = await this.usersService.hasRefreshHash(
      payload.sub,
      hashToken(refreshToken),
    );
    if (!live) throw invalid();

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw invalid();

    return {
      accessToken: this.signAccessToken(user),
      refreshExpiresAt: payload.exp * 1000,
      user,
    };
  }

  // Revokes just this device's token. An expired token is still accepted (the
  // signature is checked, the expiry is not), so a user whose refresh token
  // lapsed can still be logged out cleanly. A missing or invalid token is not an
  // error: there is nothing to revoke, and logout must always succeed.
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        refreshToken,
        { secret: this.refreshSecret, ignoreExpiration: true },
      );
    } catch {
      return;
    }
    if (payload.type !== 'refresh' || !payload.sub) return;

    await this.usersService.removeRefreshHash(
      payload.sub,
      hashToken(refreshToken),
    );
  }

  async updateCredentials(userId: string, dto: UpdateCredentialsDto) {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) throw new UnauthorizedException();

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isMatch) {
      // A wrong password here is a validation failure, not a dead session —
      // 400, not 401, so it never gets swept up by the frontend's
      // redirect-on-401 interceptor (which exists precisely to catch a
      // real invalid/expired session, not this).
      throw new BadRequestException('Current password is incorrect');
    }

    if (!dto.newFullName && !dto.newEmail && !dto.newPassword) {
      throw new BadRequestException(
        'Provide newFullName, newEmail, and/or newPassword',
      );
    }

    // Unlike email (admin-only), full name may be changed by anyone.
    if (dto.newFullName) {
      user.fullName = dto.newFullName;
    }

    // Only admins may change their email — regular users can only change their password.
    if (dto.newEmail && user.role !== 'admin') {
      throw new ForbiddenException('Only admins can change their email');
    }

    if (dto.newEmail && dto.newEmail.toLowerCase() !== user.email) {
      const existing = await this.usersService.findByEmail(dto.newEmail);

      if (existing) {
        throw new ConflictException('Email already in use');
      }

      user.email = dto.newEmail.toLowerCase();
    }

    if (dto.newPassword) {
      user.passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    }

    try {
      await user.save();
    } catch (err) {
      // optimisticConcurrency (schema) rejects a save based on a stale read —
      // another update landed in between. Fail loudly instead of silently
      // overwriting it.
      if (err instanceof mongoose.Error.VersionError) {
        throw new ConflictException(
          'Credentials were updated concurrently — please retry.',
        );
      }
      throw err;
    }

    // Fresh tokens carrying the updated email and existing role. The refresh
    // hashes are replaced, not appended to: changing credentials signs out every
    // other device, so a session opened with the old password cannot outlive it.
    const accessToken = this.signAccessToken(user);
    const { refreshToken, hash, refreshExpiresAt } =
      await this.issueRefreshToken(user._id);
    await this.usersService.replaceRefreshHashes(String(user._id), [hash]);

    return { accessToken, refreshToken, refreshExpiresAt, user };
  }
}
