import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, E2eUser } from './helpers/e2e-data';

// The rate limits against the real throttler. Every other e2e spec runs with
// the throttler's storage swapped for one that never counts, so a 429 could not
// be provoked anywhere else; this spec keeps the real one (realThrottler) and
// is the only one that does.
//
// Each limit is counted per route handler and per IP, so every route is
// exhausted exactly once, and the app is closed afterwards: the counters live
// in the app's own in-memory storage and are gone with it, which is also why
// this must stay a spec file of its own and not share an app with another.
//
// The requests are chosen to be cheap while still counting. The throttler
// guard runs before body validation and before the handler, so an invalid body
// (400), an unauthenticated refresh (401) or a missing post (404) each use up
// one request exactly like a successful one, without bcrypt, writes or model
// calls.

describeE2e('rate limits', () => {
  let app: INestApplication;
  let data: E2eData;
  let member: E2eUser;

  const http = () => request(app.getHttpServer());

  // Sends `limit` requests that must all be handled normally (the status the
  // route gives for this request), then one more, which is returned.
  async function exhaust(
    send: () => request.Test,
    limit: number,
    handledStatus: number,
  ) {
    for (let i = 1; i <= limit; i++) {
      const res = await send();
      expect(`request ${i}: ${res.status}`).toBe(
        `request ${i}: ${handledStatus}`,
      );
    }
    return send();
  }

  function expectThrottled(res: request.Response) {
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      success: false,
      statusCode: 429,
      message: expect.stringMatching(/too many requests/i),
      errors: [],
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  }

  beforeAll(async () => {
    app = await createE2eApp({ realThrottler: true });
    data = new E2eData(app);
    await data.sweepLeftovers();
    member = await data.createUser('user');
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  it('login: the 6th attempt in a minute is a 429', async () => {
    const res = await exhaust(
      () =>
        http()
          .post('/auth/login')
          .send({
            email: 'nobody-e2e-rate@example.test',
            password: 'whatever-it-is',
          }),
      5,
      401, // an unknown email: a fast 401, no password hashing
    );

    expectThrottled(res);
  });

  it('a limit is per route: with login used up, other routes still answer', async () => {
    await http().get('/auth/me').expect(401); // not 429
    await http().get('/posts?limit=1').expect(200);
  });

  it('signup: the 6th request in a minute is a 429', async () => {
    const res = await exhaust(
      () => http().post('/auth/signup').send({}),
      5,
      400, // invalid body, so no account is ever created
    );

    expectThrottled(res);
  });

  it('refresh: the 21st request in a minute is a 429', async () => {
    const res = await exhaust(() => http().post('/auth/refresh'), 20, 401);

    expectThrottled(res);
  });

  it('update credentials: the 11th request in a minute is a 429', async () => {
    const res = await exhaust(
      () => http().patch('/auth/me').set('Cookie', member.cookie).send({}),
      10,
      400,
    );

    expectThrottled(res);
  });

  it('search: the 41st request in a minute is a 429', async () => {
    const res = await exhaust(() => http().get('/posts/search'), 40, 400);

    expectThrottled(res);
  });

  it('summarize: the 11th request in a minute is a 429', async () => {
    const postId = new Types.ObjectId().toString();
    const res = await exhaust(
      () =>
        http().post(`/posts/${postId}/summarize`).set('Cookie', member.cookie),
      10,
      404, // no such post, so the model is never called
    );

    expectThrottled(res);
  });
});
