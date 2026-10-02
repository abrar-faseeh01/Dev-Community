import { jest } from '@jest/globals';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

// The one thing JwtAuthGuard adds to the stock AuthGuard('jwt') is the
// @Public() opt-out. So the stock canActivate (which would run passport and
// need a real token) is replaced with a spy on the parent class: a protected
// route must reach it, a public route must not. The Reflector and the
// @Public() decorator are the real ones.
//
// What these cannot show: that passport really rejects a missing or bad
// cookie. test/auth.e2e-spec.ts covers that against the running app.

class Protected {
  handle() {}
}

class PublicHandler {
  @Public()
  handle() {}
}

@Public()
class PublicClass {
  handle() {}
}

type Controller = { prototype: { handle: () => void } };

function contextFor(controller: Controller): ExecutionContext {
  return {
    getHandler: () => controller.prototype.handle,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());

  // JwtAuthGuard.prototype's own prototype is the class AuthGuard('jwt') builds.
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (context: ExecutionContext) => unknown;
  };
  const parentCanActivate = jest.spyOn(parent, 'canActivate');

  beforeEach(() => {
    parentCanActivate.mockReset();
    parentCanActivate.mockReturnValue('delegated-to-passport');
  });

  afterAll(() => {
    parentCanActivate.mockRestore();
  });

  it('protects a route by default: an undecorated handler goes through passport', () => {
    const context = contextFor(Protected);

    const result = guard.canActivate(context);

    expect(result).toBe('delegated-to-passport');
    expect(parentCanActivate).toHaveBeenCalledTimes(1);
    expect(parentCanActivate).toHaveBeenCalledWith(context);
  });

  it('lets a @Public() handler through without running passport', () => {
    expect(guard.canActivate(contextFor(PublicHandler))).toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('lets every handler of a @Public() class through without running passport', () => {
    expect(guard.canActivate(contextFor(PublicClass))).toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
  });
});
