import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData } from './helpers/e2e-data';

// Smoke test for the harness itself: that the app is built the way production
// builds it, that a signed cookie authenticates, that the throttler is out of
// the way, and — most importantly — that cleanup and the sweep touch only the
// rows they are supposed to.
describeE2e('e2e harness', () => {
  let app: INestApplication;
  let data: E2eData;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  it('serves the public feed to an anonymous visitor in the response envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/posts?limit=1')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('nextCursor');
  });

  it('runs the global setup: an error is wrapped in the failure envelope', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(401);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('runs the global setup: the validation pipe rejects an unknown property', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'x@example.test', password: 'whatever', extra: 1 })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Validation failed');
  });

  it('a signed cookie authenticates a throwaway user', async () => {
    const user = await data.createUser('user');

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', user.cookie)
      .expect(200);

    expect(res.body.data).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'user',
    });
  });

  it('a throwaway admin carries the admin role', async () => {
    const admin = await data.createUser('admin');

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(res.body.data.role).toBe('admin');
  });

  it('the throwaway account cannot be logged into', async () => {
    const user = await data.createUser('user');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'guess-1234567890' })
      .expect(401);
  });

  it('does not throttle: 120 requests and 8 login attempts all get real answers', async () => {
    const statuses: number[] = [];
    for (let batch = 0; batch < 6; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          request(app.getHttpServer()).get('/posts?limit=1'),
        ),
      );
      statuses.push(...responses.map((r) => r.status));
    }
    expect(statuses).toHaveLength(120);
    expect(statuses.every((s) => s === 200)).toBe(true);

    // POST /auth/login is limited to 5 a minute in production.
    const loginStatuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `${data.runId}-nobody-${i}@example.test`,
          password: 'guess-1234567890',
        });
      loginStatuses.push(res.status);
    }
    expect(loginStatuses).toEqual(Array(8).fill(401));
  });

  describe('cleanup and sweep', () => {
    it('cleanup removes exactly the rows the test made', async () => {
      const scratch = new E2eData(app);
      const user = await scratch.createUser('user');

      const created = await request(app.getHttpServer())
        .post('/posts')
        .set('Cookie', user.cookie)
        .send({ title: 'harness smoke test', body: 'throwaway post' })
        .expect(201);
      const postId: string = created.body.data.id;
      // Deliberately not tracked: cleanup must still find it through its
      // author.

      expect(await scratch.models.user.countDocuments({ _id: user.id })).toBe(1);
      expect(await scratch.models.post.countDocuments({ _id: postId })).toBe(1);

      const result = await scratch.cleanup();

      expect(result).toMatchObject({ users: 1, usersMissing: 0, posts: 1 });
      expect(await scratch.models.user.countDocuments({ _id: user.id })).toBe(0);
      expect(await scratch.models.post.countDocuments({ _id: postId })).toBe(0);
      expect(
        await scratch.models.user.countDocuments({
          email: new RegExp(`^e2e-day9-${scratch.runId}-`),
        }),
      ).toBe(0);
    });

    it('cleanup removes audit entries and notifications tied to the throwaway user', async () => {
      const scratch = new E2eData(app);
      const user = await scratch.createUser('user');
      const admin = await scratch.createUser('admin');

      await scratch.models.notification.create({
        userId: user.id,
        message: 'harness smoke test',
      });
      await scratch.models.auditLog.create({
        adminId: admin.id,
        adminFullName: admin.fullName,
        targetUserId: user.id,
        targetFullName: user.fullName,
        action: 'update_post',
        previousState: null,
        newState: null,
      });

      const result = await scratch.cleanup();

      expect(result).toMatchObject({ users: 2, auditLogs: 1, notifications: 1 });
      expect(
        await scratch.models.notification.countDocuments({ userId: user.id }),
      ).toBe(0);
      expect(
        await scratch.models.auditLog.countDocuments({ targetUserId: user.id }),
      ).toBe(0);
    });

    it('never tracks or touches an account without the marker', async () => {
      const scratch = new E2eData(app);
      // Stands in for a real account. Created and removed by exact id, in a
      // finally block, so it cannot outlive this test.
      const keeper = await data.models.user.create({
        fullName: 'Not an e2e user',
        email: `keeper-${data.runId}@example.test`,
        passwordHash: randomBytes(32).toString('hex'),
        role: 'user',
      });
      const keeperId = String(keeper._id);
      const post = await data.models.post.create({
        authorId: keeper._id,
        title: 'belongs to the keeper',
        body: 'must survive',
      });
      const note = await data.models.notification.create({
        userId: keeperId,
        message: 'must survive',
      });

      try {
        expect(await scratch.trackUser(keeperId)).toBe(false);
        const cleaned = await scratch.cleanup();
        expect(cleaned).toMatchObject({
          users: 0,
          posts: 0,
          comments: 0,
          auditLogs: 0,
          notifications: 0,
        });

        // The sweep must ignore it too: its email does not match the marker.
        // Run from the main instance, which leaves its own users alone (a
        // second instance would treat them as an earlier run's leftovers).
        const swept = await data.sweepLeftovers();
        expect(swept.users).toBe(0);

        expect(await data.models.user.countDocuments({ _id: keeperId })).toBe(1);
        expect(await data.models.post.countDocuments({ _id: post._id })).toBe(1);
        expect(
          await data.models.notification.countDocuments({ _id: note._id }),
        ).toBe(1);
      } finally {
        await data.models.notification.deleteOne({ _id: note._id });
        await data.models.post.deleteOne({ _id: post._id });
        await data.models.user.deleteOne({ _id: new Types.ObjectId(keeperId) });
      }
    });

    it('the sweep removes an earlier run\'s leftovers and leaves this run\'s users alone', async () => {
      // "Earlier run": another instance, so a different runId, whose user is
      // never cleaned up (as if that run had crashed).
      const crashedRun = new E2eData(app);
      const leftover = await crashedRun.createUser('user');
      const ownUser = await data.createUser('user');

      const swept = await data.sweepLeftovers();

      expect(swept.users).toBeGreaterThanOrEqual(1);
      expect(await data.models.user.countDocuments({ _id: leftover.id })).toBe(0);
      expect(await data.models.user.countDocuments({ _id: ownUser.id })).toBe(1);
    });

    it('the sweep refuses to delete anything above its limit', async () => {
      const crashedRun = new E2eData(app);
      const leftover = await crashedRun.createUser('user');

      await expect(data.sweepLeftovers({ maxUsers: 0 })).rejects.toThrow(
        /refusing to delete/,
      );
      expect(await data.models.user.countDocuments({ _id: leftover.id })).toBe(1);

      // Normal sweep afterwards recovers it.
      await data.sweepLeftovers();
      expect(await data.models.user.countDocuments({ _id: leftover.id })).toBe(0);
    });
  });
});
