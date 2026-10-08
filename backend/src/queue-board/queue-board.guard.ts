import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import type { UsersService } from '../users/users.service';

export interface QueueBoardGuardOptions {
  enabled: boolean;
  jwt: Pick<JwtService, 'verifyAsync'>;
  users: Pick<UsersService, 'findById'>;
}

// Bull Board is mounted as plain Express middleware, so the app's global
// JwtAuthGuard and RolesGuard never see it. This does the same job by hand,
// the way JwtStrategy does: read the access_token cookie, check the signature
// and expiry, load the user and require the admin role as stored in the
// database (not the role copied into the token), so a demoted or deleted admin
// loses access straight away.
//
// Errors go to next() so they leave through the app's usual error filter.
export function createQueueBoardGuard({
  enabled,
  jwt,
  users,
}: QueueBoardGuardOptions) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Switched off: behave as if the page does not exist.
      if (!enabled) throw new NotFoundException();

      const token = (req.cookies as Record<string, string> | undefined)?.[
        'access_token'
      ];
      if (!token) throw new UnauthorizedException();

      let userId: string;
      try {
        const payload = await jwt.verifyAsync<{ sub?: string }>(token);
        if (!payload.sub) throw new Error('no subject');
        userId = payload.sub;
      } catch {
        throw new UnauthorizedException(); // bad signature, malformed or expired
      }

      const user = await users.findById(userId).catch(() => null);
      if (!user) throw new UnauthorizedException();
      if (user.role !== 'admin') throw new ForbiddenException();

      next();
    } catch (error) {
      next(error);
    }
  };
}
