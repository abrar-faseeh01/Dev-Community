import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData } from './helpers/e2e-data';

// Real-database checks for the auth path. Every other e2e spec mints a signed
// cookie directly (E2eData.createUser), so POST /auth/login and the cookie it
// sets have never been exercised. Here a member signs up and logs in through
// the real endpoints, and the cookie from login (not a minted one) is what
// authenticates the protected requests. The unit spec proves the service
// logic against mocks; what only the running app shows is here: the
// ValidationPipe stripping a client-sent role, the cookie's flags, passport
// accepting or rejecting the cookie, and the global RolesGuard on POST /posts.
//
// Not covered: the 5-a-minute limit on signup and login. createE2eApp() swaps
// the throttler's storage for one that never counts, so a 429 cannot be
// provoked here.
const PASSWORD = 'correct-horse-battery';

// The access_token cookie out of a response's Set-Cookie headers, or undefined.
function accessTokenCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('access_token='));
}

// Just "access_token=<jwt>", the part a browser sends back in Cookie.
function cookieHeader(setCookie: string): string {
  return setCookie.split(';')[0];
}

describeE2e('auth', () => {
  let app: INestApplication;
  let data: E2eData;

  const http = () => request(app.getHttpServer());

  // Signs up through the real endpoint and tracks the new user BEFORE the
  // caller asserts anything, so a failing assertion cannot leak the account.
  async function signUp(email: string, extra: Record<string, unknown> = {}) {
    const res = await http()
      .post('/auth/signup')
      .send({ fullName: 'E2E Member', email, password: PASSWORD, ...extra });
    const id: string | undefined = res.body?.data?.id;
    if (id) await data.trackUser(id);
    return res;
  }

  const logIn = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });

  let memberEmail: string;
  let signupRes: request.Response;
  let loginRes: request.Response;
  let memberCookie: string;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();

    memberEmail = data.nextEmail();
    signupRes = await signUp(memberEmail);
    loginRes = await logIn(memberEmail, PASSWORD);
    const setCookie = accessTokenCookie(loginRes);
    memberCookie = setCookie ? cookieHeader(setCookie) : '';
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  describe('signup', () => {
    it('creates the account and returns only the public fields', () => {
      expect(signupRes.status).toBe(201);
      expect(signupRes.body.success).toBe(true);
      expect(Object.keys(signupRes.body.data).sort()).toEqual([
        'email',
        'fullName',
        'id',
        'role',
      ]);
      expect(signupRes.body.data.email).toBe(memberEmail);
      expect(signupRes.body.data.role).toBe('user');
    });

    it('stores a bcrypt hash and role "user" in the database, never the plaintext', async () => {
      const row = await data.models.user
        .findById(signupRes.body.data.id)
        .select('+passwordHash')
        .lean()
        .exec();

      expect(row).not.toBeNull();
      expect(row?.role).toBe('user');
      expect(row?.passwordHash).not.toBe(PASSWORD);
      expect(row?.passwordHash.startsWith('$2b$')).toBe(true);
    });

    it('rejects a second signup with the same email (409)', async () => {
      const res = await signUp(memberEmail);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects a client-sent role with 400 and creates no account', async () => {
      const email = data.nextEmail();

      const res = await signUp(email, { role: 'admin' });

      // If the pipe ever lets the role through, the account exists: track it
      // so cleanup removes it, then fail on the assertions below.
      const row = await data.models.user
        .findOne({ email })
        .select('_id')
        .lean()
        .exec();
      if (row) await data.trackUser(String(row._id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
      expect(row).toBeNull();
    });

    it('rejects an invalid email and a short password with 400', async () => {
      const badEmail = await signUp('not-an-email');
      const shortPassword = await http()
        .post('/auth/signup')
        .send({
          fullName: 'E2E Member',
          email: data.nextEmail(),
          password: 'short',
        });

      expect(badEmail.status).toBe(400);
      expect(shortPassword.status).toBe(400);
    });
  });

  describe('login', () => {
    it('logs in and sets an httpOnly access_token cookie', () => {
      expect(loginRes.status).toBe(200);

      const setCookie = accessTokenCookie(loginRes);
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie ?? '')?.[1]);
      expect(maxAge).toBeGreaterThan(0);
    });

    it('returns exactly the four public fields, no token and no password hash', () => {
      expect(Object.keys(loginRes.body.data).sort()).toEqual([
        'email',
        'fullName',
        'id',
        'role',
      ]);
      expect(loginRes.body.data.id).toBe(signupRes.body.data.id);
      expect(loginRes.body.data.role).toBe('user');
    });

    it('rejects a wrong password with 401 and sets no cookie', async () => {
      const res = await logIn(memberEmail, 'not-the-password');

      expect(res.status).toBe(401);
      expect(accessTokenCookie(res)).toBeUndefined();
    });

    it('rejects an unknown email with the same 401 and message, and no cookie', async () => {
      const wrongPassword = await logIn(memberEmail, 'not-the-password');
      const unknownEmail = await logIn(data.nextEmail(), PASSWORD);

      expect(unknownEmail.status).toBe(401);
      expect(accessTokenCookie(unknownEmail)).toBeUndefined();
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('the cookie from login', () => {
    it('authenticates GET /auth/me', async () => {
      expect(memberCookie).toContain('access_token=');

      const res = await http().get('/auth/me').set('Cookie', memberCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: signupRes.body.data.id,
        fullName: 'E2E Member',
        email: memberEmail,
        role: 'user',
      });
    });

    it('is required: GET /auth/me without it, or with a garbage one, is 401', async () => {
      const none = await http().get('/auth/me');
      const garbage = await http()
        .get('/auth/me')
        .set('Cookie', 'access_token=not-a-real-jwt');

      expect(none.status).toBe(401);
      expect(garbage.status).toBe(401);
    });

    it('lets the member create a post (201), and refuses it without the cookie (401)', async () => {
      const created = await http()
        .post('/posts')
        .set('Cookie', memberCookie)
        .send({
          title: 'auth e2e post',
          body: 'created with the cookie from a real login',
        });
      // Tracked by id; cleanup would also remove it as the member's post.
      if (created.body?.data?.id) data.trackPost(created.body.data.id);
      const anonymous = await http()
        .post('/posts')
        .send({ title: 'auth e2e post', body: 'no cookie' });

      expect(created.status).toBe(201);
      expect(created.body.data.title).toBe('auth e2e post');
      expect(anonymous.status).toBe(401);
    });

    it('is refused on POST /posts for an admin (403): admins moderate, they do not post', async () => {
      const admin = await data.createUser('admin');

      const res = await http()
        .post('/posts')
        .set('Cookie', admin.cookie)
        .send({ title: 'admin post', body: 'should be refused' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears the access_token cookie', async () => {
      const res = await http().post('/auth/logout').set('Cookie', memberCookie);

      expect(res.status).toBe(200);
      const cleared = accessTokenCookie(res);
      expect(cleared).toBeDefined();
      // clearCookie sends an empty value that expired in the past.
      expect(cleared).toMatch(/^access_token=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('cleanup', () => {
    it('removes the throwaway users it tracked and leaves none behind', async () => {
      const memberId: string = signupRes.body.data.id;
      expect(
        await data.models.user.findById(memberId).lean().exec(),
      ).not.toBeNull();

      const result = await data.cleanup();

      // At least the signed-up member; the admin from the 403 test is also
      // tracked, but only when that test ran, so the exact count is not fixed.
      expect(result.users).toBeGreaterThanOrEqual(1);
      expect(result.usersMissing).toBe(0);
      expect(
        await data.models.user.findById(memberId).lean().exec(),
      ).toBeNull();
      expect(
        await data.models.user.findOne({ email: memberEmail }).lean().exec(),
      ).toBeNull();
    });
  });
});
