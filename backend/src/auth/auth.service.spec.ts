import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Queue } from 'bullmq';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { MAX_REFRESH_SESSIONS, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';

// UsersService is always faked. The first describe also fakes JwtService (a
// stub that returns 'signed-token'); the "refresh sessions" describe uses a
// REAL JwtService so tokens can be verified, tampered with and expired.
// bcrypt is the REAL module: the
// service imports it as a namespace, which Jest's ESM mode cannot mock, and a
// real hash is what lets these tests prove "the stored value is a hash of the
// password" instead of "a mock was called". Fixtures are hashed at cost 4
// (about 1 ms); only signup and the newPassword path pay the real cost-12 hash
// (about 265 ms), because the service's SALT_ROUNDS is a private constant.
//
// What these cannot show: a mock returns whatever the test scripts, so they
// say nothing about real Mongo behaviour or about the ValidationPipe that
// strips a client-sent role before the service ever runs. test/auth.e2e-spec.ts
// covers those against the running app.

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type SyncFn = (...args: unknown[]) => unknown;

const PASSWORD = 'correct-horse-battery';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'u1',
    fullName: 'Ada Lovelace',
    email: 'ada@x.test',
    role: 'user',
    passwordHash: PASSWORD_HASH,
    save: jest.fn<AsyncFn>().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Runs a promise that is expected to reject and hands back what it threw, so
// one call can be checked for both its type and its message.
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

// The two settings AuthService reads from ConfigService.
const ACCESS_SECRET = 'a'.repeat(40);
const REFRESH_SECRET = 'r'.repeat(40);
function configStub(mailMode?: 'queue' | 'sync'): ConfigService {
  return {
    getOrThrow: () => REFRESH_SECRET,
    get: (key: string, fallback: unknown) =>
      key === 'MAIL_MODE' && mailMode ? mailMode : fallback,
  } as unknown as ConfigService;
}

// The welcome-email collaborators. Signup is the only method that uses them,
// so the other tests just receive these unused stand-ins.
function mailStubs() {
  const add = jest.fn<AsyncFn>().mockResolvedValue(undefined);
  const sendWelcome = jest.fn<AsyncFn>().mockResolvedValue(undefined);
  return {
    add,
    sendWelcome,
    mailQueue: { add } as unknown as Queue,
    mailService: { sendWelcome } as unknown as MailService,
  };
}

describe('AuthService', () => {
  const findByEmail = jest.fn<AsyncFn>();
  const findByEmailWithPassword = jest.fn<AsyncFn>();
  const findByIdWithPassword = jest.fn<AsyncFn>();
  const create = jest.fn<AsyncFn>();
  const addRefreshHash = jest.fn<AsyncFn>();
  const replaceRefreshHashes = jest.fn<AsyncFn>();
  const sign = jest.fn<SyncFn>();

  const usersService = {
    findByEmail,
    findByEmailWithPassword,
    findByIdWithPassword,
    create,
    addRefreshHash,
    replaceRefreshHashes,
  } as unknown as UsersService;
  const jwtService = { sign } as unknown as JwtService;

  let service: AuthService;
  let mail: ReturnType<typeof mailStubs>;

  beforeEach(() => {
    findByEmail.mockReset();
    findByEmailWithPassword.mockReset();
    findByIdWithPassword.mockReset();
    create.mockReset();
    addRefreshHash.mockReset();
    replaceRefreshHashes.mockReset();
    sign.mockReset();
    sign.mockReturnValue('signed-token');
    mail = mailStubs();
    service = new AuthService(
      usersService,
      jwtService,
      configStub(),
      mail.mailQueue,
      mail.mailService,
    );
  });

  /*     SIGNUP     */

  describe('signup', () => {
    const dto: SignupDto = {
      fullName: 'Ada Lovelace',
      email: 'ada@x.test',
      password: PASSWORD,
    };

    it('rejects a duplicate email with 409 and creates nothing', async () => {
      findByEmail.mockResolvedValue(makeUser());

      const err = await caught(service.signup(dto));

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe('Email already in use');
      expect(create).not.toHaveBeenCalled();

      expect(mail.add).not.toHaveBeenCalled();
    });

    it('stores a bcrypt hash of the password, never the plaintext', async () => {
      findByEmail.mockResolvedValue(null);
      create.mockResolvedValue(makeUser());

      await service.signup(dto);

      const arg = create.mock.calls[0][0] as { passwordHash: string };
      expect(arg.passwordHash).not.toBe(PASSWORD);
      expect(bcrypt.compareSync(PASSWORD, arg.passwordHash)).toBe(true);
      // The prefix also pins the cost factor: lowering SALT_ROUNDS fails here.
      expect(arg.passwordHash.startsWith('$2b$12$')).toBe(true);
    });

    it('passes only fullName, email and passwordHash to create', async () => {
      findByEmail.mockResolvedValue(null);
      create.mockResolvedValue(makeUser());

      await service.signup(dto);

      const arg = create.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(arg).sort()).toEqual([
        'email',
        'fullName',
        'passwordHash',
      ]);
      expect(arg.fullName).toBe('Ada Lovelace');
      expect(arg.email).toBe('ada@x.test');
    });

    it('never takes a role from the dto, even if one is smuggled in', async () => {
      findByEmail.mockResolvedValue(null);
      create.mockResolvedValue(makeUser());
      const smuggled = { ...dto, role: 'admin' } as unknown as SignupDto;

      await service.signup(smuggled);

      const arg = create.mock.calls[0][0] as Record<string, unknown>;
      expect(arg).not.toHaveProperty('role');
    });

    it('returns the created user', async () => {
      const created = makeUser();
      findByEmail.mockResolvedValue(null);
      create.mockResolvedValue(created);

      await expect(service.signup(dto)).resolves.toBe(created);
    });
    describe('welcome email', () => {
      beforeEach(() => {
        findByEmail.mockResolvedValue(null);
        create.mockResolvedValue(makeUser());
      });

      it('adds one welcome job carrying only the user id', async () => {
        await service.signup(dto);

        expect(mail.add).toHaveBeenCalledTimes(1);
        const [name, data, opts] = mail.add.mock.calls[0] as [
          string,
          Record<string, unknown>,
          Record<string, unknown>,
        ];
        expect(name).toBe('welcome-email');
        expect(data).toEqual({ userId: 'u1' });
        expect(opts).toMatchObject({ jobId: 'welcome-u1', attempts: 5 });
        expect(mail.sendWelcome).not.toHaveBeenCalled();
      });

      it('still creates the account when the add is rejected, and logs that no email will be sent', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {});
        mail.add.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(service.signup(dto)).resolves.toMatchObject({
          _id: 'u1',
        });
        expect(create).toHaveBeenCalledTimes(1);

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const message = String(errorSpy.mock.calls[0][0]);
        expect(message).toContain('user u1');
        expect(message).toContain('no welcome email will be sent');
        expect(message).toContain('connect ECONNREFUSED');
        expect(message).not.toContain('ada@x.test');
        errorSpy.mockRestore();
      });

      it('still creates the account when the queue never answers, and logs that the email will be late', async () => {
        const errorSpy = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {});
        // A dead Redis does not reject, it just never replies.
        mail.add.mockReturnValue(new Promise(() => {}));

        await expect(service.signup(dto)).resolves.toMatchObject({
          _id: 'u1',
        });

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const message = String(errorSpy.mock.calls[0][0]);
        expect(message).toContain('user u1');
        expect(message).toContain('not added within 2000 ms');
        expect(message).toContain('sent late');
        expect(message).toContain('if Redis returns');
        expect(message).not.toContain('ada@x.test');
        errorSpy.mockRestore();
      }, 10_000);

      it('in sync mode sends the email itself and adds no job', async () => {
        const syncService = new AuthService(
          usersService,
          jwtService,
          configStub('sync'),
          mail.mailQueue,
          mail.mailService,
        );

        await syncService.signup(dto);

        expect(mail.sendWelcome).toHaveBeenCalledWith(
          'ada@x.test',
          'Ada Lovelace',
        );
        expect(mail.add).not.toHaveBeenCalled();
      });

      it('in sync mode a mail failure makes signup fail', async () => {
        mail.sendWelcome.mockRejectedValue(new Error('Simulated SMTP failure'));
        const syncService = new AuthService(
          usersService,
          jwtService,
          configStub('sync'),
          mail.mailQueue,
          mail.mailService,
        );

        const err = await caught(syncService.signup(dto));

        expect((err as Error).message).toBe('Simulated SMTP failure');
      });
    });
  });

  /*     LOGIN     */
  describe('login', () => {
    const dto: LoginDto = { email: 'ada@x.test', password: PASSWORD };

    it('rejects an unknown email with 401 and signs nothing', async () => {
      findByEmailWithPassword.mockResolvedValue(null);

      const err = await caught(service.login(dto));

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe('Invalid credentials');
      expect(sign).not.toHaveBeenCalled();
    });

    it('rejects a wrong password with 401 and signs nothing', async () => {
      findByEmailWithPassword.mockResolvedValue(makeUser());

      const err = await caught(
        service.login({ ...dto, password: 'not-the-password' }),
      );

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe('Invalid credentials');
      expect(sign).not.toHaveBeenCalled();
    });

    it('gives the same error for an unknown email and a wrong password', async () => {
      findByEmailWithPassword.mockResolvedValueOnce(null);
      const unknownEmail = await caught(service.login(dto));

      findByEmailWithPassword.mockResolvedValueOnce(makeUser());
      const wrongPassword = await caught(
        service.login({ ...dto, password: 'nope-nope-nope' }),
      );

      expect((unknownEmail as Error).constructor).toBe(
        (wrongPassword as Error).constructor,
      );
      expect((unknownEmail as Error).message).toBe(
        (wrongPassword as Error).message,
      );
    });

    it('signs an access token with sub, email and role, and returns it with the user', async () => {
      const user = makeUser({ role: 'admin' });
      findByEmailWithPassword.mockResolvedValue(user);

      const result = await service.login(dto);

      // Two tokens: the access token and the refresh token.
      expect(sign).toHaveBeenCalledTimes(2);
      expect(sign).toHaveBeenCalledWith({
        sub: user._id,
        email: user.email,
        role: 'admin',
      });
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
        refreshExpiresAt: expect.any(Number),
        user,
      });
    });

    it('stores the hash of the refresh token, not the token', async () => {
      findByEmailWithPassword.mockResolvedValue(makeUser());

      await service.login(dto);

      expect(addRefreshHash).toHaveBeenCalledTimes(1);
      expect(addRefreshHash).toHaveBeenCalledWith(
        'u1',
        createHash('sha256').update('signed-token').digest('hex'),
      );
    });

    it('stores nothing when the login is rejected', async () => {
      findByEmailWithPassword.mockResolvedValue(null);

      await caught(service.login(dto));

      expect(addRefreshHash).not.toHaveBeenCalled();
    });
  });

  /*     UPDATE CREDENTIALS     */

  describe('updateCredentials', () => {
    const base: UpdateCredentialsDto = { currentPassword: PASSWORD };

    it('rejects with 401 when the account no longer exists', async () => {
      findByIdWithPassword.mockResolvedValue(null);

      const err = await caught(
        service.updateCredentials('u1', { ...base, newFullName: 'New Name' }),
      );

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong current password with 400 (not 401) and saves nothing', async () => {
      const user = makeUser();
      findByIdWithPassword.mockResolvedValue(user);

      const err = await caught(
        service.updateCredentials('u1', {
          currentPassword: 'wrong-password',
          newFullName: 'New Name',
        }),
      );

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toBe('Current password is incorrect');
      expect(user.save).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it('rejects a request that changes nothing with 400', async () => {
      const user = makeUser();
      findByIdWithPassword.mockResolvedValue(user);

      const err = await caught(service.updateCredentials('u1', base));

      expect(err).toBeInstanceOf(BadRequestException);
      expect(user.save).not.toHaveBeenCalled();
    });

    it('lets anyone change just their name without touching the email checks', async () => {
      const user = makeUser();
      findByIdWithPassword.mockResolvedValue(user);

      const result = await service.updateCredentials('u1', {
        ...base,
        newFullName: 'Ada K. Lovelace',
      });

      expect(findByEmail).not.toHaveBeenCalled();
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(user.fullName).toBe('Ada K. Lovelace');
      expect(user.passwordHash).toBe(PASSWORD_HASH);
      expect(sign).toHaveBeenCalledWith({
        sub: user._id,
        email: 'ada@x.test',
        role: 'user',
      });
      expect(result).toMatchObject({ accessToken: 'signed-token', user });
    });

    it('forbids a non-admin from changing their email (403) and saves nothing', async () => {
      const user = makeUser({ role: 'user' });
      findByIdWithPassword.mockResolvedValue(user);

      const err = await caught(
        service.updateCredentials('u1', {
          ...base,
          newFullName: 'New Name',
          newEmail: 'other@x.test',
        }),
      );

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(findByEmail).not.toHaveBeenCalled();
      // newFullName was already set on the in-memory doc by this point; the
      // guarantee is that it is never persisted.
      expect(user.save).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it('rejects an admin changing to an email that is taken (409) and saves nothing', async () => {
      const user = makeUser({ role: 'admin', email: 'admin@x.test' });
      findByIdWithPassword.mockResolvedValue(user);
      findByEmail.mockResolvedValue(
        makeUser({ _id: 'u2', email: 'taken@x.test' }),
      );

      const err = await caught(
        service.updateCredentials('u1', { ...base, newEmail: 'taken@x.test' }),
      );

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe('Email already in use');
      expect(user.save).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it('lets an admin change their email, lowercased, and signs a token with the new one', async () => {
      const user = makeUser({ role: 'admin', email: 'admin@x.test' });
      findByIdWithPassword.mockResolvedValue(user);
      findByEmail.mockResolvedValue(null);

      await service.updateCredentials('u1', {
        ...base,
        newEmail: 'New.Admin@X.test',
      });

      expect(user.email).toBe('new.admin@x.test');
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(sign).toHaveBeenCalledWith({
        sub: user._id,
        email: 'new.admin@x.test',
        role: 'admin',
      });
    });

    it('skips the uniqueness lookup when an admin "changes" to their own email in another case', async () => {
      const user = makeUser({ role: 'admin', email: 'admin@x.test' });
      findByIdWithPassword.mockResolvedValue(user);

      await service.updateCredentials('u1', {
        ...base,
        newEmail: 'ADMIN@x.test',
      });

      expect(findByEmail).not.toHaveBeenCalled();
      expect(user.email).toBe('admin@x.test');
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    it('stores a fresh bcrypt hash of the new password', async () => {
      const user = makeUser();
      findByIdWithPassword.mockResolvedValue(user);

      await service.updateCredentials('u1', {
        ...base,
        newPassword: 'a-brand-new-password',
      });

      expect(user.passwordHash).not.toBe(PASSWORD_HASH);
      expect(user.passwordHash).not.toBe('a-brand-new-password');
      expect(
        bcrypt.compareSync('a-brand-new-password', user.passwordHash),
      ).toBe(true);
      expect(user.passwordHash.startsWith('$2b$12$')).toBe(true);
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    it('replaces every refresh hash with just the new one (other devices are signed out)', async () => {
      findByIdWithPassword.mockResolvedValue(makeUser());

      await service.updateCredentials('u1', {
        ...base,
        newFullName: 'New Name',
      });

      expect(replaceRefreshHashes).toHaveBeenCalledTimes(1);
      expect(replaceRefreshHashes).toHaveBeenCalledWith('u1', [
        createHash('sha256').update('signed-token').digest('hex'),
      ]);
    });

    it('leaves the refresh hashes alone when the update is rejected', async () => {
      findByIdWithPassword.mockResolvedValue(makeUser());

      await caught(
        service.updateCredentials('u1', {
          currentPassword: 'wrong-password',
          newFullName: 'New Name',
        }),
      );

      expect(replaceRefreshHashes).not.toHaveBeenCalled();
    });

    it('turns a concurrent-update VersionError into 409', async () => {
      const user = makeUser();
      // The constructor only reads doc._doc._id for its message.
      user.save.mockRejectedValue(
        new mongoose.Error.VersionError(
          { _doc: { _id: 'u1' } } as never,
          1,
          [],
        ),
      );
      findByIdWithPassword.mockResolvedValue(user);

      const err = await caught(
        service.updateCredentials('u1', { ...base, newFullName: 'New Name' }),
      );

      expect(err).toBeInstanceOf(ConflictException);
      expect(sign).not.toHaveBeenCalled();
    });

    it('rethrows any other save error unchanged', async () => {
      const boom = new Error('connection lost');
      const user = makeUser();
      user.save.mockRejectedValue(boom);
      findByIdWithPassword.mockResolvedValue(user);

      const err = await caught(
        service.updateCredentials('u1', { ...base, newFullName: 'New Name' }),
      );

      expect(err).toBe(boom);
    });
  });

  /*     REFRESH SESSIONS (real JwtService)     */

  describe('refresh sessions', () => {
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    const dto: LoginDto = { email: 'ada@x.test', password: PASSWORD };

    // Same semantics as the Mongo updates in UsersService, kept in memory:
    // append and keep the newest MAX_REFRESH_SESSIONS; remove one; replace all.
    // The real operators are checked against Mongo in the e2e specs.
    function setup() {
      const hashes = new Map<string, string[]>();
      const user = makeUser();
      const users = {
        findByEmailWithPassword: async () => user,
        findByIdWithPassword: async () => user,
        findByEmail: async () => null,
        findById: async (id: string) => (id === 'u1' ? user : null),
        addRefreshHash: async (id: string, h: string) => {
          hashes.set(
            id,
            [...(hashes.get(id) ?? []), h].slice(-MAX_REFRESH_SESSIONS),
          );
        },
        hasRefreshHash: async (id: string, h: string) =>
          (hashes.get(id) ?? []).includes(h),
        removeRefreshHash: async (id: string, h: string) => {
          hashes.set(
            id,
            (hashes.get(id) ?? []).filter((x) => x !== h),
          );
        },
        replaceRefreshHashes: async (id: string, hs: string[]) => {
          hashes.set(id, hs);
        },
      } as unknown as UsersService;
      const jwt = new JwtService({
        secret: ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      });
      return {
        hashes,
        user,
        jwt,
        service: new AuthService(
          users,
          jwt,
          configStub(),
          mailStubs().mailQueue,
          mailStubs().mailService,
        ),
      };
    }

    const stored = (h: Map<string, string[]>) => h.get('u1') ?? [];

    // A refresh token signed the way the service does, for tampering and
    // expiry cases the service would never produce itself.
    const signRefresh = (
      jwt: JwtService,
      payload: Record<string, unknown>,
      opts: { secret?: string; expiresIn?: string | number } = {},
    ) =>
      jwt.sign(
        { sub: 'u1', type: 'refresh', jti: 'x', ...payload },
        {
          secret: opts.secret ?? REFRESH_SECRET,
          expiresIn: (opts.expiresIn ?? '7d') as never,
        },
      );

    describe('login', () => {
      it('issues a refresh token with its own secret, type and jti, and an access token with the access secret', async () => {
        const { service, jwt } = setup();

        const { accessToken, refreshToken } = await service.login(dto);

        const refresh = jwt.verify(refreshToken, { secret: REFRESH_SECRET });
        expect(refresh).toMatchObject({ sub: 'u1', type: 'refresh' });
        expect(typeof refresh.jti).toBe('string');
        expect(() =>
          jwt.verify(refreshToken, { secret: ACCESS_SECRET }),
        ).toThrow();

        const access = jwt.verify(accessToken, { secret: ACCESS_SECRET });
        expect(access).toMatchObject({ sub: 'u1', email: 'ada@x.test' });
        expect(() =>
          jwt.verify(accessToken, { secret: REFRESH_SECRET }),
        ).toThrow();
      });

      it('stores the sha256 of the refresh token and never the token itself', async () => {
        const { service, hashes } = setup();

        const { refreshToken } = await service.login(dto);

        expect(stored(hashes)).toEqual([sha(refreshToken)]);
        expect(stored(hashes)).not.toContain(refreshToken);
      });

      it('gives two logins in the same second different tokens and hashes', async () => {
        const { service, hashes } = setup();

        const a = await service.login(dto);
        const b = await service.login(dto);

        expect(a.refreshToken).not.toBe(b.refreshToken);
        expect(new Set(stored(hashes)).size).toBe(2);
      });

      it('reports when the refresh token expires, about 7 days out', async () => {
        const { service } = setup();

        const { refreshExpiresAt } = await service.login(dto);

        const week = 7 * 24 * 60 * 60 * 1000;
        expect(Math.abs(refreshExpiresAt - (Date.now() + week))).toBeLessThan(
          5000,
        );
      });

      it('keeps only the newest 5 sessions: a sixth login evicts the first', async () => {
        const { service, hashes } = setup();

        const first = await service.login(dto);
        const others = [];
        for (let i = 0; i < MAX_REFRESH_SESSIONS; i++) {
          others.push(await service.login(dto));
        }

        expect(stored(hashes)).toHaveLength(MAX_REFRESH_SESSIONS);
        await expect(service.refresh(first.refreshToken)).rejects.toThrow(
          UnauthorizedException,
        );
        for (const session of others) {
          await expect(
            service.refresh(session.refreshToken),
          ).resolves.toBeDefined();
        }
      });
    });

    describe('refresh', () => {
      it('returns a new access token for a live refresh token, without rotating it', async () => {
        const { service, jwt, hashes } = setup();
        const { refreshToken, refreshExpiresAt } = await service.login(dto);
        const before = [...stored(hashes)];

        const result = await service.refresh(refreshToken);

        expect(
          jwt.verify(result.accessToken, { secret: ACCESS_SECRET }),
        ).toMatchObject({ sub: 'u1', email: 'ada@x.test', role: 'user' });
        // The cookie must not outlive the token it renews.
        expect(
          Math.abs(result.refreshExpiresAt - refreshExpiresAt),
        ).toBeLessThan(2000);
        expect(stored(hashes)).toEqual(before);
        // Still usable: two tabs refreshing together both succeed.
        await expect(service.refresh(refreshToken)).resolves.toBeDefined();
      });

      it('rejects a missing token', async () => {
        const { service } = setup();

        await expect(service.refresh(undefined)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(service.refresh('')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects garbage and a tampered token', async () => {
        const { service } = setup();
        const { refreshToken } = await service.login(dto);
        const [h, p, sig] = refreshToken.split('.');
        const flipped = sig[10] === 'A' ? 'B' : 'A';
        const tamperedSig = sig.slice(0, 10) + flipped + sig.slice(11);

        for (const bad of ['not-a-jwt', `${h}.${p}.${tamperedSig}`]) {
          await expect(service.refresh(bad)).rejects.toThrow(
            UnauthorizedException,
          );
        }
      });

      it('rejects a valid-signature token whose hash was never stored', async () => {
        const { service, jwt } = setup();

        await expect(
          service.refresh(signRefresh(jwt, { jti: 'never-issued' })),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('rejects an access token presented as a refresh token', async () => {
        const { service } = setup();
        const { accessToken } = await service.login(dto);

        await expect(service.refresh(accessToken)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it("rejects a token signed with the refresh secret that is not type 'refresh'", async () => {
        const { service, jwt, hashes } = setup();
        const token = signRefresh(jwt, { type: 'access' });
        hashes.set('u1', [sha(token)]); // even with a stored hash

        await expect(service.refresh(token)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects an expired refresh token even though its hash is stored', async () => {
        const { service, jwt, hashes } = setup();
        const token = signRefresh(jwt, {}, { expiresIn: -10 });
        hashes.set('u1', [sha(token)]);

        await expect(service.refresh(token)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects when the user no longer exists', async () => {
        const { service, jwt, hashes } = setup();
        const token = signRefresh(jwt, { sub: 'deleted-user' });
        hashes.set('deleted-user', [sha(token)]);

        await expect(service.refresh(token)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('gives every failure the same error message', async () => {
        const { service, jwt } = setup();
        const messages = new Set<string>();

        for (const bad of [
          undefined,
          'garbage',
          signRefresh(jwt, { jti: 'never-issued' }),
          signRefresh(jwt, {}, { expiresIn: -10 }),
        ]) {
          const err = await caught(service.refresh(bad));
          messages.add((err as Error).message);
        }

        expect(messages.size).toBe(1);
      });
    });

    describe('logout', () => {
      it('revokes only this device: the others keep working', async () => {
        const { service, hashes } = setup();
        const phone = await service.login(dto);
        const laptop = await service.login(dto);

        await service.logout(phone.refreshToken);

        expect(stored(hashes)).toEqual([sha(laptop.refreshToken)]);
        await expect(service.refresh(phone.refreshToken)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(
          service.refresh(laptop.refreshToken),
        ).resolves.toBeDefined();
      });

      it('still revokes a token that has already expired', async () => {
        const { service, jwt, hashes } = setup();
        const token = signRefresh(jwt, {}, { expiresIn: -10 });
        hashes.set('u1', [sha(token)]);

        await service.logout(token);

        expect(stored(hashes)).toEqual([]);
      });

      it.each([
        ['no token', undefined],
        ['an empty token', ''],
        ['garbage', 'not-a-jwt'],
      ])('succeeds and revokes nothing for %s', async (_label, token) => {
        const { service, hashes } = setup();
        const { refreshToken } = await service.login(dto);

        await expect(service.logout(token)).resolves.toBeUndefined();

        expect(stored(hashes)).toEqual([sha(refreshToken)]);
      });

      it('revokes nothing for an access token', async () => {
        const { service, hashes } = setup();
        const { accessToken, refreshToken } = await service.login(dto);

        await service.logout(accessToken);

        expect(stored(hashes)).toEqual([sha(refreshToken)]);
      });
    });

    describe('updateCredentials', () => {
      it('signs out every other session and keeps only the new one', async () => {
        const { service, hashes } = setup();
        const phone = await service.login(dto);
        const laptop = await service.login(dto);

        const changed = await service.updateCredentials('u1', {
          currentPassword: PASSWORD,
          newFullName: 'Ada K. Lovelace',
        });

        expect(stored(hashes)).toEqual([sha(changed.refreshToken)]);
        await expect(service.refresh(phone.refreshToken)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(service.refresh(laptop.refreshToken)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(
          service.refresh(changed.refreshToken),
        ).resolves.toBeDefined();
      });
    });
  });
});
