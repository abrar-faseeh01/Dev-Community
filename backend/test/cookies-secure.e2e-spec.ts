import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData } from './helpers/e2e-data';

// The Secure flag on the session cookies. Under Jest NODE_ENV is "test", so the
// other specs see plain cookies (refresh.e2e-spec.ts asserts that). Production
// turns Secure on through COOKIE_SECURE, which the Zod schema also defaults to
// true when NODE_ENV=production (covered in env.validation.spec.ts).
//
// ConfigModule reads the environment once, when AppModule is first imported,
// and createE2eApp() imports it lazily, so setting the variable here, before
// the app is created, is enough. It is a spec file of its own because that
// import happens once per file.
const PASSWORD = 'correct-horse-battery';
const previous = process.env.COOKIE_SECURE;
process.env.COOKIE_SECURE = 'true';

function setCookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`no Set-Cookie for ${name}`);
  return line;
}

const pair = (line: string) => line.split(';')[0];

describeE2e('session cookies with COOKIE_SECURE=true', () => {
  let app: INestApplication;
  let data: E2eData;
  let email: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();

    email = data.nextEmail();
    const signup = await http()
      .post('/auth/signup')
      .send({ fullName: 'E2E Secure', email, password: PASSWORD });
    const id: string | undefined = signup.body?.data?.id;
    if (id) await data.trackUser(id);
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
      if (previous === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = previous;
    }
  });

  const expectSecure = (res: request.Response) => {
    for (const name of ['access_token', 'refresh_token']) {
      const line = setCookie(res, name);
      expect(line).toContain('; Secure');
      expect(line).toContain('HttpOnly');
      expect(line).toContain('SameSite=Lax');
    }
  };

  it('login sets both cookies Secure', async () => {
    const res = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    expectSecure(res);
  });

  it('refresh sets the new access cookie Secure', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const res = await http()
      .post('/auth/refresh')
      .set('Cookie', pair(setCookie(login, 'refresh_token')))
      .expect(200);

    expect(setCookie(res, 'access_token')).toContain('; Secure');
  });

  it('a credential change sets both cookies Secure', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const res = await http()
      .patch('/auth/me')
      .set('Cookie', pair(setCookie(login, 'access_token')))
      .send({ currentPassword: PASSWORD, newFullName: 'E2E Secure Renamed' })
      .expect(200);

    expectSecure(res);
  });

  it('logout clears both cookies with the same Secure attribute', async () => {
    const res = await http().post('/auth/logout').expect(200);

    for (const name of ['access_token', 'refresh_token']) {
      const line = setCookie(res, name);
      expect(line).toContain('Expires=Thu, 01 Jan 1970');
      expect(line).toContain('; Secure');
    }
  });

  it('a failed refresh clears both cookies with the same Secure attribute', async () => {
    const res = await http().post('/auth/refresh').expect(401);

    for (const name of ['access_token', 'refresh_token']) {
      expect(setCookie(res, name)).toContain('; Secure');
    }
  });
});
