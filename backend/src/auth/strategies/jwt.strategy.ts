import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

// Pulls the token from the httpOnly cookie, not an Authorization header —
// the frontend never touches the token directly.
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.['access_token'] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // Re-check the user still exists on every request (not just trust the token)
    // in case they were deleted after the token was issued.
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    // fullName/email/role read from DB, not the token — stays correct even if
    // a stale token (pre-dating a credentials change) is still floating around.
    return {
      userId: payload.sub,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }
}
