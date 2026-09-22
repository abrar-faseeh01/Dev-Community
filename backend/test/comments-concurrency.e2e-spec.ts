import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// Two bursts of concurrent requests against one post's counter, from the Day
// 9 plan's verification list. Both are measurements against the real
// database — they exist to show the atomic $inc / clamp-pipeline design from
// 4a and 4d holds up under real overlap, not just sequential calls.
const BURST_SIZE = 20;

describeE2e('comments under concurrency', () => {
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

  const http = () => request(app.getHttpServer());

  async function createPost(author: E2eUser) {
    const res = await http()
      .post('/posts')
      .set('Cookie', author.cookie)
      .send({ title: 'concurrency e2e post', body: 'a post under load' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackPost(id);
    return id;
  }

  const commentCountOf = async (postId: string) =>
    (await data.models.post.findById(postId).lean())!.commentCount;
  const liveOn = (postId: string) =>
    data.models.comment.countDocuments({ postId, deletedAt: null });

  describe(`a burst of ${BURST_SIZE} concurrent creates on one post`, () => {
    it('commentCount matches the number actually created', async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);
      // Distinct commenters, all created up front (a direct DB insert, not an
      // HTTP round trip), so the burst below is the creates alone.
      const commenters = await Promise.all(
        Array.from({ length: BURST_SIZE }, () => data.createUser('user')),
      );

      const responses = await Promise.all(
        commenters.map((user, i) =>
          http()
            .post(`/posts/${postId}/comments`)
            .set('Cookie', user.cookie)
            .send({ body: `comment ${i}` }),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(
        Array(BURST_SIZE).fill(201),
      );
      // Every request produced its own row — no create was lost or merged.
      const ids = responses.map((r) => r.body.data.id as string);
      expect(new Set(ids).size).toBe(BURST_SIZE);
      expect(await liveOn(postId)).toBe(BURST_SIZE);
      // The claim under test: the counter agrees with what was actually
      // created, not less (a lost increment) and not more.
      expect(await commentCountOf(postId)).toBe(BURST_SIZE);
    });
  });

  describe(`a burst of ${BURST_SIZE} concurrent deletes of distinct comments`, () => {
    it('commentCount ends at zero, matching the live comments', async () => {
      const author = await data.createUser('user');
      const commenter = await data.createUser('user');
      const postId = await createPost(author);
      // Created one at a time first, so the burst below is the deletes alone.
      const ids: string[] = [];
      for (let i = 0; i < BURST_SIZE; i++) {
        const res = await http()
          .post(`/posts/${postId}/comments`)
          .set('Cookie', commenter.cookie)
          .send({ body: `to be deleted ${i}` })
          .expect(201);
        ids.push(res.body.data.id);
      }
      expect(await commentCountOf(postId)).toBe(BURST_SIZE);

      const responses = await Promise.all(
        ids.map((id) =>
          http().delete(`/comments/${id}`).set('Cookie', commenter.cookie).send({}),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(
        Array(BURST_SIZE).fill(200),
      );
      expect(responses.every((r) => r.body.data.deletedCount === 1)).toBe(true);
      expect(await liveOn(postId)).toBe(0);
      // The claim under test: BURST_SIZE independent decrements, each on a
      // different comment, land on the correct total rather than clobbering
      // one another.
      expect(await commentCountOf(postId)).toBe(0);
    });
  });
});
