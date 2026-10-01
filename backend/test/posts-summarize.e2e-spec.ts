import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// POST /posts/:id/summarize against the real database. createE2eApp() forces
// the deterministic mock summarizer, so no test here ever calls Gemini; every
// 200 asserts source === 'mock', which would catch that guard breaking.
describeE2e('POST /posts/:id/summarize', () => {
  let app: INestApplication;
  let data: E2eData;
  let author: E2eUser;
  let reader: E2eUser;
  let admin: E2eUser;

  const SENTENCES =
    'React and NestJS make a solid pairing for developer tools. ' +
    'We tested the whole stack with Docker and Jest. ' +
    'The result was easy to maintain.';
  // Comfortably over the 200-character minimum.
  const NORMAL_BODY = `${SENTENCES} ${'More detail follows here. '.repeat(10)}`;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();
    author = await data.createUser('user');
    reader = await data.createUser('user');
    admin = await data.createUser('admin');
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  const http = () => request(app.getHttpServer());

  async function makePost(
    body: string,
    extra: { deletedAt?: Date } = {},
  ): Promise<string> {
    const doc = await data.models.post.create({
      authorId: author.id,
      title: 'Summarize e2e post',
      body,
      ...extra,
    });
    const id = String(doc._id);
    data.trackPost(id);
    return id;
  }

  const summarize = (id: string, cookie?: string) => {
    const req = http().post(`/posts/${id}/summarize`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  describe('success', () => {
    it('returns the structured summary from the mock for a normal post', async () => {
      const id = await makePost(NORMAL_BODY);
      const res = await summarize(id, reader.cookie).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        summary:
          'React and NestJS make a solid pairing for developer tools. We tested the whole stack with Docker and Jest.',
        tags: ['React', 'NestJS', 'Jest', 'Docker'],
        source: 'mock',
        truncated: false,
      });
    });

    it('lets the author and an admin summarize too', async () => {
      const id = await makePost(NORMAL_BODY);
      await summarize(id, author.cookie).expect(200);
      const res = await summarize(id, admin.cookie).expect(200);
      expect(res.body.data.source).toBe('mock');
    });

    it('truncates a very long body and flags it', async () => {
      const id = await makePost(`${SENTENCES} ${'word '.repeat(3000)}`);
      const res = await summarize(id, reader.cookie).expect(200);
      expect(res.body.data.truncated).toBe(true);
    });

    it('does not store anything on the post', async () => {
      const id = await makePost(NORMAL_BODY);
      await summarize(id, reader.cookie).expect(200);
      const stored = await data.models.post.findById(id).lean().exec();
      expect(stored).not.toHaveProperty('summary');
      expect(stored).not.toHaveProperty('tags');
    });
  });

  describe('rejections', () => {
    it('returns 422 for a body under 200 characters', async () => {
      const id = await makePost('Too short to summarize.');
      const res = await summarize(id, reader.cookie).expect(422);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(422);
    });

    it('returns 422 for a body that is short once whitespace is trimmed', async () => {
      const id = await makePost(`${'x'.repeat(150)}${' '.repeat(300)}`);
      await summarize(id, reader.cookie).expect(422);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await summarize('not-an-object-id', reader.cookie).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for a well-formed id that does not exist', async () => {
      await summarize(String(new Types.ObjectId()), reader.cookie).expect(404);
    });

    it('returns 404 for a soft-deleted post, exactly like a missing one', async () => {
      const id = await makePost(NORMAL_BODY, { deletedAt: new Date() });
      const res = await summarize(id, reader.cookie).expect(404);
      expect(res.body.message).toBe('Post not found');
    });

    it('returns 401 when signed out, and does so before looking at the id', async () => {
      const id = await makePost(NORMAL_BODY);
      await summarize(id).expect(401);
      await summarize('not-an-object-id').expect(401);
    });
  });
});
