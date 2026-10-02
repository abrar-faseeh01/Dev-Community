import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';

// Only UsersService and JwtService are faked. bcrypt is the REAL module: the
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

describe('AuthService', () => {
  const findByEmail = jest.fn<AsyncFn>();
  const findByEmailWithPassword = jest.fn<AsyncFn>();
  const findByIdWithPassword = jest.fn<AsyncFn>();
  const create = jest.fn<AsyncFn>();
  const sign = jest.fn<SyncFn>();

  const usersService = {
    findByEmail,
    findByEmailWithPassword,
    findByIdWithPassword,
    create,
  } as unknown as UsersService;
  const jwtService = { sign } as unknown as JwtService;

  let service: AuthService;

  beforeEach(() => {
    findByEmail.mockReset();
    findByEmailWithPassword.mockReset();
    findByIdWithPassword.mockReset();
    create.mockReset();
    sign.mockReset();
    sign.mockReturnValue('signed-token');
    service = new AuthService(usersService, jwtService);
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

    it('signs a token with sub, email and role, and returns it with the user', async () => {
      const user = makeUser({ role: 'admin' });
      findByEmailWithPassword.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(sign).toHaveBeenCalledTimes(1);
      expect(sign).toHaveBeenCalledWith({
        sub: user._id,
        email: user.email,
        role: 'admin',
      });
      expect(result).toEqual({ accessToken: 'signed-token', user });
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
      expect(result).toEqual({ accessToken: 'signed-token', user });
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
});
