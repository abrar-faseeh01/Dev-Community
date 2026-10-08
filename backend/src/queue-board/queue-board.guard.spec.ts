import { jest } from '@jest/globals';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { UsersService } from '../users/users.service';
import { createQueueBoardGuard } from './queue-board.guard';

// The guard in front of the Bull Board dashboard. A real JwtService signs and
// verifies the tokens; only the user lookup is faked.

const SECRET = 's'.repeat(40);
const jwt = new JwtService({ secret: SECRET });

type FindById = (id: string) => Promise<unknown>;

function setup(options: { enabled?: boolean; user?: unknown } = {}) {
  const findById = jest
    .fn<FindById>()
    .mockResolvedValue('user' in options ? options.user : { role: 'admin' });
  const guard = createQueueBoardGuard({
    enabled: options.enabled ?? true,
    jwt,
    users: { findById } as unknown as Pick<UsersService, 'findById'>,
  });
  const run = async (cookies?: Record<string, string>) => {
    const next = jest.fn();
    await guard({ cookies } as Request, {} as Response, next);
    return next.mock.calls[0]?.[0]; // what the guard passed on: nothing = let through
  };
  return { findById, run };
}

const tokenFor = (sub = 'u1', options: Record<string, unknown> = {}) =>
  jwt.sign({ sub, role: 'admin' }, options);

describe('queue board guard', () => {
  it('lets an admin through', async () => {
    const { run, findById } = setup();

    await expect(
      run({ access_token: tokenFor('u1') }),
    ).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledWith('u1');
  });

  it('answers 404 when the dashboard is switched off, even for an admin', async () => {
    const { run } = setup({ enabled: false });

    await expect(run({ access_token: tokenFor() })).resolves.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 401 without a cookie', async () => {
    const { run } = setup();

    await expect(run({})).resolves.toBeInstanceOf(UnauthorizedException);
    await expect(run(undefined)).resolves.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 401 for a token signed with another secret', async () => {
    const { run } = setup();
    const forged = new JwtService({ secret: 'x'.repeat(40) }).sign({
      sub: 'u1',
    });

    await expect(run({ access_token: forged })).resolves.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('answers 401 for an expired token', async () => {
    const { run } = setup();

    await expect(
      run({ access_token: tokenFor('u1', { expiresIn: -10 }) }),
    ).resolves.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 401 for garbage in the cookie', async () => {
    const { run } = setup();

    await expect(run({ access_token: 'not-a-jwt' })).resolves.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('answers 401 when the user no longer exists', async () => {
    const { run } = setup({ user: null });

    await expect(run({ access_token: tokenFor() })).resolves.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('answers 401 when the user lookup throws (malformed id)', async () => {
    const { run, findById } = setup();
    findById.mockRejectedValue(new Error('Cast to ObjectId failed'));

    await expect(run({ access_token: tokenFor() })).resolves.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('answers 403 for a signed-in non-admin', async () => {
    const { run } = setup({ user: { role: 'user' } });

    await expect(run({ access_token: tokenFor() })).resolves.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('trusts the role in the database, not the one inside the token', async () => {
    // The token still says admin, but the user has since been demoted.
    const { run } = setup({ user: { role: 'user' } });

    await expect(
      run({ access_token: jwt.sign({ sub: 'u1', role: 'admin' }) }),
    ).resolves.toBeInstanceOf(ForbiddenException);
  });
});
