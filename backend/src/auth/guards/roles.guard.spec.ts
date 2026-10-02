import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

// The Reflector is the real one and the roles are attached with the real
// @Roles() decorator on small dummy controllers, so these tests fail if the
// metadata key or the decorator ever changes. Only the HTTP request is faked.
//
// What these cannot show: that the guard is actually registered on the routes
// (it is a global APP_GUARD). test/auth.e2e-spec.ts proves the admin 403 on
// POST /posts against the running app.

class Plain {
  handle() {}
}

class UserOnly {
  @Roles('user')
  handle() {}
}

class AdminOnly {
  @Roles('admin')
  handle() {}
}

class EmptyRoles {
  @Roles()
  handle() {}
}

@Roles('admin')
class ClassLevelAdmin {
  handle() {}

  @Roles('user')
  overridden() {}
}

type Controller = { prototype: { handle: () => void } };

function contextFor(
  controller: Controller,
  method: 'handle' | 'overridden',
  user: unknown,
): ExecutionContext {
  return {
    getHandler: () =>
      (controller.prototype as unknown as Record<string, () => void>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const asUser = { userId: 'u1', role: 'user' };
  const asAdmin = { userId: 'a1', role: 'admin' };

  it('lets a request through when no roles are required, even with no user', () => {
    expect(guard.canActivate(contextFor(Plain, 'handle', undefined))).toBe(
      true,
    );
  });

  it('lets a request through when the required roles list is empty', () => {
    expect(guard.canActivate(contextFor(EmptyRoles, 'handle', asUser))).toBe(
      true,
    );
  });

  it('lets a user with the required role through', () => {
    expect(guard.canActivate(contextFor(UserOnly, 'handle', asUser))).toBe(
      true,
    );
    expect(guard.canActivate(contextFor(AdminOnly, 'handle', asAdmin))).toBe(
      true,
    );
  });

  it('rejects a user with a different role with 403', () => {
    expect(() =>
      guard.canActivate(contextFor(UserOnly, 'handle', asAdmin)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor(AdminOnly, 'handle', asUser)),
    ).toThrow(ForbiddenException);
  });

  it('rejects with the "Insufficient role" message', () => {
    expect(() =>
      guard.canActivate(contextFor(UserOnly, 'handle', asAdmin)),
    ).toThrow('Insufficient role');
  });

  it('rejects a request with no user at all when a role is required', () => {
    expect(() =>
      guard.canActivate(contextFor(UserOnly, 'handle', undefined)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor(UserOnly, 'handle', null)),
    ).toThrow(ForbiddenException);
  });

  it('applies a class-level role to a handler that sets none', () => {
    expect(
      guard.canActivate(contextFor(ClassLevelAdmin, 'handle', asAdmin)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(ClassLevelAdmin, 'handle', asUser)),
    ).toThrow(ForbiddenException);
  });

  it('lets a handler-level role override the class-level one', () => {
    expect(
      guard.canActivate(contextFor(ClassLevelAdmin, 'overridden', asUser)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(ClassLevelAdmin, 'overridden', asAdmin)),
    ).toThrow(ForbiddenException);
  });
});
