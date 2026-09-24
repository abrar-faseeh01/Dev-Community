import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { RequestUser } from '../../common/authorization/owner-or-admin';

// For a public route that is a little different for someone who is signed in
// (the reads that carry the caller's own reaction). It runs the same JWT
// strategy as the global guard, but it never rejects: no cookie, a bad or
// expired token, or an account that has since been deleted all come out as
// "nobody" (request.user = null) and the request goes on as an anonymous one.
//
// It is applied per route with @UseGuards, never globally. The global default
// stays JwtAuthGuard — protected unless a route says @Public() — so forgetting
// a decorator still fails safe. A route that uses this guard must not depend
// on the user being there.
//
// Cost worth knowing: JwtStrategy.validate reads the user from the database on
// every request that carries a valid token, so a signed-in read makes one extra
// lookup.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Explicit and empty on purpose. Without a constructor here Nest tries to
  // inject the mixin's optional AuthModuleOptions into the guard, and since a
  // @UseGuards() guard is built inside the module of the controller that uses
  // it (PostsModule, CommentsModule — neither imports PassportModule), that
  // fails at boot. The global JwtAuthGuard has a constructor for the same
  // reason. The strategy itself is registered once, in AuthModule.
  constructor() {
    super();
  }

  // Passport calls this with the strategy's outcome. The stock version throws
  // when there is no user; this one hands back null instead, and the error
  // (missing token, JsonWebTokenError, the UnauthorizedException that
  // validate() throws for a deleted account) is deliberately dropped.
  handleRequest<TUser = RequestUser>(
    _error: unknown,
    user: TUser | false | null,
  ): TUser {
    return (user || null) as TUser;
  }
}
