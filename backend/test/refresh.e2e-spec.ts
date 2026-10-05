import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData } from './helpers/e2e-data';

// The refresh flow against the real database. The unit spec proves the logic
// with an in-memory stand-in for UsersService; what only Mongo shows is here:
// that $push with $slice really keeps the newest five, that $pull removes just
// one, that refreshTokenHashes is select:false, and that the cookies leave the
// running app with the right flags and paths.
//
// Not covered here (later checkpoints): the 429 on refresh, and the Secure flag
// (NODE_ENV is "test" under Jest, so cookies are not Secure).
const PASSWORD = 'correct-horse-battery';
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

// The Set-Cookie line for one cookie name, or undefined.
function setCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`));
}

// "name=value", the part a browser sends back in Cookie.
const pair = (line: string) => line.split(';')[0];
const valueOf = (line: string) => pair(line).slice(pair(line).indexOf('=') + 1);

describeE2e('refresh tokens', () => {
  let app: INestApplication;
  let data: E2eData;
  let users: Model<User>;
  let email: string;
  let userId: string;

  const http = () => request(app.getHttpServer());
  const logIn = () =>
    http().post('/auth/login').send({ email, password: PASSWORD });
  const refresh = (cookie?: string) => {
    const req = http().post('/auth/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  // A signed-in "device": the two cookies a browser would hold after login.
  async function device() {
    const res = await logIn().expect(200);
    const access = setCookie(res, 'access_token')!;
    const refreshLine = setCookie(res, 'refresh_token')!;
    return {
      res,
      access: pair(access),
      refreshCookie: pair(refreshLine),
      refreshToken: valueOf(refreshLine),
    };
  }

  const storedHashes = async () =>
    (await users.findById(userId).select('+refreshTokenHashes'))!
      .refreshTokenHashes;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    users = app.get(getModelToken(User.name));
    await data.sweepLeftovers();

    email = data.nextEmail();
    const signup = await http()
      .post('/auth/signup')
      .send({ fullName: 'E2E Refresh', email, password: PASSWORD });
    userId = signup.body?.data?.id;
    if (userId) await data.trackUser(userId);
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  // Each test starts from a user with no sessions.
  beforeEach(async () => {
    await users.updateOne(
      { _id: userId },
      { $set: { refreshTokenHashes: [] } },
    );
  });

  describe('login', () => {
    it('sets an access cookie on / and a refresh cookie on /auth, both httpOnly and lax', async () => {
      const { res } = await device();

      const access = setCookie(res, 'access_token')!;
      const refreshLine = setCookie(res, 'refresh_token')!;
      for (const line of [access, refreshLine]) {
        expect(line).toContain('HttpOnly');
        expect(line).toContain('SameSite=Lax');
        expect(line).not.toContain('Secure'); // NODE_ENV=test
      }
      expect(access).toContain('Path=/;');
      expect(refreshLine).toContain('Path=/auth;');
    });

    it('gives both cookies the lifetime of the refresh token (about 7 days)', async () => {
      const { res } = await device();

      const maxAge = (line: string) => Number(/Max-Age=(\d+)/.exec(line)![1]);
      const week = 7 * 24 * 60 * 60;
      expect(
        Math.abs(maxAge(setCookie(res, 'refresh_token')!) - week),
      ).toBeLessThan(10);
      // The access cookie outlives its 15-minute JWT on purpose (see the
      // controller), so the Next middleware does not bounce a refreshable user.
      expect(
        Math.abs(maxAge(setCookie(res, 'access_token')!) - week),
      ).toBeLessThan(10);
    });

    it('stores the sha256 of the refresh token, never the token', async () => {
      const { refreshToken } = await device();

      expect(await storedHashes()).toEqual([sha(refreshToken)]);
    });

    it('does not put the refresh token or the hash list in the response body', async () => {
      const { res, refreshToken } = await device();

      expect(res.text).not.toContain(refreshToken);
      expect(res.text).not.toContain('refreshTokenHashes');
      expect(res.text).not.toContain('passwordHash');
    });
  });

  describe('POST /auth/refresh', () => {
    // The exact sequence the frontend interceptor depends on: a protected call
    // 401s because the access JWT expired (the cookie is still there, since it
    // lives as long as the refresh token), one refresh fixes it, and the same
    // call then works.
    it('recovers an expired access token: protected route 401, refresh 200, protected route 200', async () => {
      const { refreshCookie } = await device();
      const expired = app
        .get(JwtService)
        .sign({ sub: userId, email, role: 'user' }, { expiresIn: -10 });

      const rejected = await http()
        .get('/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);
      expect(rejected.body).toMatchObject({ success: false, statusCode: 401 });

      const renewed = await refresh(refreshCookie).expect(200);
      await http()
        .get('/auth/me')
        .set('Cookie', pair(setCookie(renewed, 'access_token')!))
        .expect(200);
    });

    it('issues a new access cookie that authenticates, and leaves the refresh cookie alone', async () => {
      const { refreshCookie, refreshToken } = await device();

      const res = await refresh(refreshCookie).expect(200);

      expect(res.body.data).toMatchObject({ id: userId, email });
      expect(res.text).not.toContain(refreshToken);
      const access = setCookie(res, 'access_token')!;
      expect(access).toContain('Path=/;');
      expect(setCookie(res, 'refresh_token')).toBeUndefined();

      const me = await http()
        .get('/auth/me')
        .set('Cookie', pair(access))
        .expect(200);
      expect(me.body.data.email).toBe(email);
    });

    it('can be repeated with the same refresh cookie (not rotated)', async () => {
      const { refreshCookie } = await device();

      await refresh(refreshCookie).expect(200);
      await refresh(refreshCookie).expect(200);
      expect(await storedHashes()).toHaveLength(1);
    });

    it('is a 401 with no cookie, and clears both cookies on their own paths', async () => {
      const res = await refresh().expect(401);

      expect(res.body).toMatchObject({ success: false, statusCode: 401 });
      const access = setCookie(res, 'access_token')!;
      const refreshLine = setCookie(res, 'refresh_token')!;
      expect(access).toContain('Path=/;');
      expect(access).toContain('Expires=Thu, 01 Jan 1970');
      expect(refreshLine).toContain('Path=/auth;');
      expect(refreshLine).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('is a 401 for a refresh token that was not issued by login', async () => {
      const jwt = app.get(JwtService);
      const secret = app
        .get(ConfigService)
        .getOrThrow<string>('JWT_REFRESH_SECRET');
      const forged = jwt.sign(
        { sub: userId, type: 'refresh', jti: 'never-issued' },
        { secret, expiresIn: '7d' },
      );

      await refresh(`refresh_token=${forged}`).expect(401);
    });

    it('is a 401 for an expired refresh token even when its hash is stored', async () => {
      const jwt = app.get(JwtService);
      const secret = app
        .get(ConfigService)
        .getOrThrow<string>('JWT_REFRESH_SECRET');
      const expired = jwt.sign(
        { sub: userId, type: 'refresh', jti: 'expired' },
        { secret, expiresIn: -10 },
      );
      await users.updateOne(
        { _id: userId },
        { $set: { refreshTokenHashes: [sha(expired)] } },
      );

      await refresh(`refresh_token=${expired}`).expect(401);
    });

    it('does not accept the access token as a refresh token', async () => {
      const { access } = await device();

      await refresh(access.replace('access_token=', 'refresh_token=')).expect(
        401,
      );
    });
  });

  describe('sessions', () => {
    it('keeps the newest 5: a sixth login signs out the first device only', async () => {
      const first = await device();
      const others = [];
      for (let i = 0; i < 5; i++) others.push(await device());

      expect(await storedHashes()).toHaveLength(5);
      await refresh(first.refreshCookie).expect(401);
      for (const d of others) await refresh(d.refreshCookie).expect(200);
    });

    it('logout signs out this device only and clears both cookies', async () => {
      const phone = await device();
      const laptop = await device();

      const res = await http()
        .post('/auth/logout')
        .set('Cookie', phone.refreshCookie)
        .expect(200);

      expect(setCookie(res, 'access_token')).toContain(
        'Expires=Thu, 01 Jan 1970',
      );
      expect(setCookie(res, 'refresh_token')).toContain('Path=/auth;');
      expect(await storedHashes()).toEqual([sha(laptop.refreshToken)]);
      await refresh(phone.refreshCookie).expect(401);
      await refresh(laptop.refreshCookie).expect(200);
    });

    it('logout works with no cookies at all', async () => {
      const res = await http().post('/auth/logout').expect(200);

      expect(res.body).toEqual({ success: true, data: null });
      expect(setCookie(res, 'refresh_token')).toBeDefined();
    });

    it('a credential change signs out every other device and issues new cookies', async () => {
      const phone = await device();
      const laptop = await device();

      const res = await http()
        .patch('/auth/me')
        .set('Cookie', laptop.access)
        .send({ currentPassword: PASSWORD, newFullName: 'E2E Renamed' })
        .expect(200);

      const newRefresh = setCookie(res, 'refresh_token')!;
      expect(await storedHashes()).toEqual([sha(valueOf(newRefresh))]);
      await refresh(phone.refreshCookie).expect(401);
      await refresh(laptop.refreshCookie).expect(401);
      await refresh(pair(newRefresh)).expect(200);
    });
  });

  describe('the hash list never leaves the database layer', () => {
    it('is not returned by a normal query', async () => {
      await device();

      const user = await users.findById(userId);

      expect(user!.refreshTokenHashes).toBeUndefined();
    });

    it('is stripped by toJSON even when it was selected', async () => {
      await device();

      const user = await users.findById(userId).select('+refreshTokenHashes');

      expect(user!.refreshTokenHashes).toHaveLength(1);
      expect(JSON.stringify(user)).not.toContain('refreshTokenHashes');
    });
  });

  // Day 18's "done when": no token, password or secret in an unsafe response or
  // log. A flow that mixes good and bad requests is run once, with the server's
  // stdout/stderr captured, and every response body and every logged line is
  // checked for the values that must never leave the server. The Set-Cookie
  // headers are excluded on purpose: the tokens are meant to be there.
  describe('secrets', () => {
    const WRONG = 'definitely-the-wrong-password';
    const GARBAGE_TOKEN = 'garbage-refresh-token-value';
    const LEAKED_IN_BODY = 'hunter2-should-never-be-echoed';

    it('keeps passwords, tokens, hashes and secrets out of every response body and out of the log', async () => {
      const config = app.get(ConfigService);
      const secrets = [
        config.getOrThrow<string>('JWT_SECRET'),
        config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      ];

      const logged: string[] = [];
      const capture = (chunk: unknown) => {
        logged.push(String(chunk));
        return true;
      };
      const stdout = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(capture);
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(capture);

      const bodies: string[] = [];
      const tokens: string[] = [];
      try {
        // Proves the capture sees the Nest logger at all, so "nothing found"
        // below cannot just mean "nothing was being listened to". Error level:
        // the testing module mutes everything below it.
        new Logger('capture-control').error('capture-control-line');

        const seen = (res: request.Response) => {
          bodies.push(res.text);
          return res;
        };

        seen(
          await http()
            .post('/auth/login')
            .send({ email, password: WRONG })
            .expect(401),
        );
        const login = seen(await logIn().expect(200));
        const access = pair(setCookie(login, 'access_token')!);
        const refreshLine = setCookie(login, 'refresh_token')!;
        tokens.push(
          valueOf(setCookie(login, 'access_token')!),
          valueOf(refreshLine),
        );

        seen(await http().get('/auth/me').set('Cookie', access).expect(200));
        seen(await refresh(pair(refreshLine)).expect(200));
        seen(
          await http()
            .patch('/auth/me')
            .set('Cookie', access)
            .send({ currentPassword: WRONG, newFullName: 'x' })
            .expect(400),
        );
        seen(
          await http()
            .patch('/auth/me')
            .set('Cookie', access)
            .send({ currentPassword: PASSWORD, newFullName: 'E2E Secrets' })
            .expect(200),
        );
        seen(
          await http()
            .post('/auth/login')
            .set('Content-Type', 'application/json')
            .send(`{"email":"${email}","password":${LEAKED_IN_BODY}}`)
            .expect(400),
        );
        seen(
          await http()
            .post('/auth/login')
            .send({ email, password: 'x'.repeat(110_000) })
            .expect(413),
        );
        seen(await refresh(`refresh_token=${GARBAGE_TOKEN}`).expect(401));
        seen(
          await http()
            .post('/auth/logout')
            .set('Cookie', pair(refreshLine))
            .expect(200),
        );
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }

      const forbidden = [
        PASSWORD,
        WRONG,
        GARBAGE_TOKEN,
        LEAKED_IN_BODY,
        ...tokens,
        ...secrets,
        'passwordHash',
        'refreshTokenHashes',
        '$2b$', // the start of every bcrypt hash
      ];
      const output = logged.join('');

      expect(output).toContain('capture-control-line');
      for (const value of forbidden) {
        for (const body of bodies) expect(body).not.toContain(value);
        expect(output).not.toContain(value);
      }
    });
  });
});
