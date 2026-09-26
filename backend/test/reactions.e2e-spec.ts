import { INestApplication } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// Real-database checks for the reaction engine. The unit specs prove the
// service maps "which operation matched" to the right counter change; what
// only a real database can show is here: that the unique index really rejects
// a duplicate, that the {type: opposite} switch filter really only matches the
// opposite type, that a counter really only moves by $inc, and that concurrent
// identical requests leave the stored counters equal to the reaction rows.
type Kind = 'post' | 'comment';
type Type = 'like' | 'dislike';

const BURST = 20;

describeE2e('reactions', () => {
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

  async function createPost(author: E2eUser, title = 'reactions e2e post') {
    const res = await http()
      .post('/posts')
      .set('Cookie', author.cookie)
      .send({ title, body: 'a post to react to' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackPost(id);
    return id;
  }

  async function createComment(author: E2eUser, postId: string) {
    const res = await http()
      .post(`/posts/${postId}/comments`)
      .set('Cookie', author.cookie)
      .send({ body: 'a comment to react to' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackComment(id);
    return id;
  }

  const path = (kind: Kind, id: string) =>
    kind === 'post' ? `/posts/${id}/reaction` : `/comments/${id}/reaction`;

  const react = (user: E2eUser, kind: Kind, id: string, type: Type) =>
    http().post(path(kind, id)).set('Cookie', user.cookie).send({ type });

  // The Post and Comment models are different types, and a union of two
  // models cannot be called; both carry the two counters and that is all these
  // tests touch, so they are viewed through one minimal type.
  type Counted = { likeCount?: number; dislikeCount?: number };
  const targetModel = (kind: Kind) =>
    (kind === 'post'
      ? data.models.post
      : data.models.comment) as unknown as Model<Counted>;

  // The counters as stored on the target itself.
  async function storedCounts(kind: Kind, id: string) {
    const model = targetModel(kind);
    const doc = await model.findById(id).lean();
    return {
      likeCount: doc!.likeCount ?? 0,
      dislikeCount: doc!.dislikeCount ?? 0,
    };
  }

  // The reaction rows for the target, counted by type.
  async function rowCounts(kind: Kind, id: string) {
    const [likeCount, dislikeCount] = await Promise.all([
      data.models.reaction.countDocuments({
        targetType: kind,
        targetId: id,
        type: 'like',
      }),
      data.models.reaction.countDocuments({
        targetType: kind,
        targetId: id,
        type: 'dislike',
      }),
    ]);
    return { likeCount, dislikeCount };
  }

  // The invariant the whole design exists for: whatever happened, the stored
  // counters equal the rows.
  async function expectCountersMatchRows(kind: Kind, id: string) {
    expect(await storedCounts(kind, id)).toEqual(await rowCounts(kind, id));
  }

  // Each target type gets the identical behaviour checks, on a target of its
  // own so nothing carries over between cases.
  describe.each<Kind>(['post', 'comment'])('on a %s', (kind) => {
    async function newTarget() {
      const author = await data.createUser('user');
      const postId = await createPost(author);
      const id = kind === 'post' ? postId : await createComment(author, postId);
      return { author, postId, id };
    }

    describe('toggle behaviour', () => {
      it('creates, switches and removes, with matching counters and one row throughout', async () => {
        const { id } = await newTarget();
        const user = await data.createUser('user');

        // create
        const created = await react(user, kind, id, 'like').expect(200);
        expect(created.body).toEqual({
          success: true,
          data: { likeCount: 1, dislikeCount: 0, myReaction: 'like' },
        });
        expect(await storedCounts(kind, id)).toEqual({
          likeCount: 1,
          dislikeCount: 0,
        });

        // switch like -> dislike: one goes down and the other up, and it is
        // still ONE row, changed in place.
        const switched = await react(user, kind, id, 'dislike').expect(200);
        expect(switched.body.data).toEqual({
          likeCount: 0,
          dislikeCount: 1,
          myReaction: 'dislike',
        });
        expect(await storedCounts(kind, id)).toEqual({
          likeCount: 0,
          dislikeCount: 1,
        });
        expect(
          await data.models.reaction.countDocuments({
            userId: user.id,
            targetType: kind,
            targetId: id,
          }),
        ).toBe(1);

        // switch back, then remove by sending the same type again
        await react(user, kind, id, 'like').expect(200);
        const removed = await react(user, kind, id, 'like').expect(200);
        expect(removed.body.data).toEqual({
          likeCount: 0,
          dislikeCount: 0,
          myReaction: null,
        });
        expect(await rowCounts(kind, id)).toEqual({
          likeCount: 0,
          dislikeCount: 0,
        });
        await expectCountersMatchRows(kind, id);
      });

      it('counts different users separately', async () => {
        const { id } = await newTarget();
        const [a, b, c] = await Promise.all([
          data.createUser('user'),
          data.createUser('user'),
          data.createUser('user'),
        ]);

        await react(a, kind, id, 'like').expect(200);
        await react(b, kind, id, 'like').expect(200);
        const last = await react(c, kind, id, 'dislike').expect(200);

        expect(last.body.data).toEqual({
          likeCount: 2,
          dislikeCount: 1,
          myReaction: 'dislike',
        });
        await expectCountersMatchRows(kind, id);
      });

      it('starts from 0 on a target stored before the counters existed', async () => {
        const { id } = await newTarget();
        // Simulate an old row: the counters are not stored at all. ($add on a
        // missing field is null, which is what the $ifNull in the update guards.)
        const model = targetModel(kind);
        await model.collection.updateOne(
          { _id: new Types.ObjectId(id) },
          { $unset: { likeCount: '', dislikeCount: '' } },
        );
        const user = await data.createUser('user');

        const res = await react(user, kind, id, 'like').expect(200);

        expect(res.body.data).toEqual({
          likeCount: 1,
          dislikeCount: 0,
          myReaction: 'like',
        });
        expect(await storedCounts(kind, id)).toEqual({
          likeCount: 1,
          dislikeCount: 0,
        });
      });

      it('never shows a negative count, though storage is left as the plain $inc made it', async () => {
        const { postId, id } = await newTarget();
        const user = await data.createUser('user');
        await react(user, kind, id, 'like').expect(200);
        // Corrupt the counter on purpose: the row says liked, the counter says 0.
        const model = targetModel(kind);
        await model.updateOne({ _id: id }, { $set: { likeCount: 0 } });

        const removed = await react(user, kind, id, 'like').expect(200);

        // The response and the reads floor it at 0 ...
        expect(removed.body.data.likeCount).toBe(0);
        const shown =
          kind === 'post'
            ? (await http().get(`/posts/${id}`).expect(200)).body.data
            : (await http().get(`/posts/${postId}/comments`).expect(200)).body
                .data[0];
        expect(shown.likeCount).toBe(0);
        // ... but nothing is clamped on the WRITE: the decrement landed as-is.
        // (A floor on the write is what loses updates when requests race.)
        expect((await storedCounts(kind, id)).likeCount).toBe(-1);
      });
    });

    describe('the unique index', () => {
      it('refuses a second row for the same user and target, whatever its type', async () => {
        const { id } = await newTarget();
        const user = await data.createUser('user');
        await react(user, kind, id, 'like').expect(200);

        // Straight at the collection, bypassing the service entirely.
        await expect(
          data.models.reaction.create({
            userId: user.id,
            targetType: kind,
            targetId: id,
            type: 'like',
          }),
        ).rejects.toMatchObject({ code: 11000 });
        await expect(
          data.models.reaction.create({
            userId: user.id,
            targetType: kind,
            targetId: id,
            type: 'dislike',
          }),
        ).rejects.toMatchObject({ code: 11000 });

        expect(
          await data.models.reaction.countDocuments({
            userId: user.id,
            targetType: kind,
            targetId: id,
          }),
        ).toBe(1);
      });
    });

    describe('concurrency', () => {
      // Pure toggle semantics do not promise a final liked/unliked state when
      // identical requests race (each one flips it), so these assert what does
      // hold: nothing crashes and the stored counters equal the rows.
      it.each([5, BURST])(
        '%i identical concurrent requests from one user leave the counters equal to the rows',
        async (n) => {
          const { id } = await newTarget();
          const user = await data.createUser('user');

          const responses = await Promise.all(
            Array.from({ length: n }, () => react(user, kind, id, 'like')),
          );

          expect(responses.map((r) => r.status)).toEqual(Array(n).fill(200));
          expect(
            await data.models.reaction.countDocuments({
              userId: user.id,
              targetType: kind,
              targetId: id,
            }),
          ).toBeLessThanOrEqual(1);
          await expectCountersMatchRows(kind, id);
        },
      );

      it('mixed like and dislike requests racing from one user leave the counters equal to the rows', async () => {
        const { id } = await newTarget();
        const user = await data.createUser('user');

        const responses = await Promise.all(
          Array.from({ length: BURST }, (_, i) =>
            react(user, kind, id, i % 2 === 0 ? 'like' : 'dislike'),
          ),
        );

        expect(responses.map((r) => r.status)).toEqual(
          Array(BURST).fill(200),
        );
        await expectCountersMatchRows(kind, id);
      });

      it(`${BURST} different users reacting at once are all counted, none lost`, async () => {
        const { id } = await newTarget();
        const users = await Promise.all(
          Array.from({ length: BURST }, () => data.createUser('user')),
        );

        const responses = await Promise.all(
          users.map((u) => react(u, kind, id, 'like')),
        );

        expect(responses.map((r) => r.status)).toEqual(
          Array(BURST).fill(200),
        );
        expect(await storedCounts(kind, id)).toEqual({
          likeCount: BURST,
          dislikeCount: 0,
        });
        await expectCountersMatchRows(kind, id);
      });
    });

    describe('rejected requests', () => {
      it('400s a malformed id, an unknown type, and an unknown property', async () => {
        const { id } = await newTarget();
        const user = await data.createUser('user');

        await http()
          .post(path(kind, 'not-an-id'))
          .set('Cookie', user.cookie)
          .send({ type: 'like' })
          .expect(400);
        await http()
          .post(path(kind, id))
          .set('Cookie', user.cookie)
          .send({ type: 'love' })
          .expect(400);
        await http()
          .post(path(kind, id))
          .set('Cookie', user.cookie)
          .send({ type: 'like', userId: user.id })
          .expect(400);
        await http()
          .post(path(kind, id))
          .set('Cookie', user.cookie)
          .send({})
          .expect(400);

        await expectCountersMatchRows(kind, id);
      });

      it('404s a target that does not exist, and writes nothing', async () => {
        const user = await data.createUser('user');
        const missing = '64f1c2e5a1b2c3d4e5f6a7ff';

        await react(user, kind, missing, 'like').expect(404);

        expect(
          await data.models.reaction.countDocuments({
            userId: user.id,
            targetId: missing,
          }),
        ).toBe(0);
      });

      it('404s a target that has been deleted, and writes nothing', async () => {
        const { author, postId, id } = await newTarget();
        const user = await data.createUser('user');
        if (kind === 'post') {
          await http()
            .delete(`/posts/${postId}`)
            .set('Cookie', author.cookie)
            .send({})
            .expect(200);
        } else {
          await http()
            .delete(`/comments/${id}`)
            .set('Cookie', author.cookie)
            .send({})
            .expect(200);
        }

        await react(user, kind, id, 'like').expect(404);

        expect(
          await data.models.reaction.countDocuments({
            userId: user.id,
            targetType: kind,
            targetId: id,
          }),
        ).toBe(0);
      });

      it('403s an administrator and 401s an anonymous caller', async () => {
        const { id } = await newTarget();
        const admin = await data.createUser('admin');

        await react(admin, kind, id, 'like').expect(403);
        await http().post(path(kind, id)).send({ type: 'like' }).expect(401);

        expect(await rowCounts(kind, id)).toEqual({
          likeCount: 0,
          dislikeCount: 0,
        });
      });
    });

    // The list behind the "who reacted" overlay. Every request is anonymous
    // unless a test says otherwise: it is a public read, like the post itself.
    describe('who reacted', () => {
      const reactorsPath = (id: string) =>
        kind === 'post' ? `/posts/${id}/reactions` : `/comments/${id}/reactions`;

      type ListedReactor = {
        user: { id: string | null; fullName: string; headline?: string | null };
        type: Type;
      };
      type ReactorList = {
        items: ListedReactor[];
        likeCount: number;
        dislikeCount: number;
      };
      const listReactors = async (id: string, query = '') => {
        const res = await http().get(`${reactorsPath(id)}${query}`).expect(200);
        return res.body.data as ReactorList;
      };

      it('lists everyone who reacted, newest first, with their names and types and the totals', async () => {
        const { id } = await newTarget();
        const first = await data.createUser('user');
        const second = await data.createUser('user');
        const third = await data.createUser('user');
        await react(first, kind, id, 'like').expect(200);
        await react(second, kind, id, 'dislike').expect(200);
        await react(third, kind, id, 'like').expect(200);

        const res = await http().get(reactorsPath(id)).expect(200);

        expect(res.body.success).toBe(true);
        const list = res.body.data as ReactorList;
        expect(list.items).toEqual([
          {
            user: { id: third.id, fullName: third.fullName },
            type: 'like',
          },
          {
            user: { id: second.id, fullName: second.fullName },
            type: 'dislike',
          },
          {
            user: { id: first.id, fullName: first.fullName },
            type: 'like',
          },
        ]);
        expect(list.likeCount).toBe(2);
        expect(list.dislikeCount).toBe(1);
        // Only id, name and headline of a user ever leave the server.
        expect(JSON.stringify(res.body)).not.toContain('example.test');
        expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      });

      it('is empty, not an error, for a target nobody has reacted to', async () => {
        const { id } = await newTarget();

        expect(await listReactors(id)).toEqual({
          items: [],
          likeCount: 0,
          dislikeCount: 0,
        });
      });

      it('narrows to one type with ?type=, and keeps both totals', async () => {
        const { id } = await newTarget();
        const liker = await data.createUser('user');
        const disliker = await data.createUser('user');
        await react(liker, kind, id, 'like').expect(200);
        await react(disliker, kind, id, 'dislike').expect(200);

        const likes = await listReactors(id, '?type=like');
        expect(likes.items.map((r) => r.user.id)).toEqual([liker.id]);
        expect(likes.likeCount).toBe(1);
        expect(likes.dislikeCount).toBe(1);

        const dislikes = await listReactors(id, '?type=dislike');
        expect(dislikes.items.map((r) => r.user.id)).toEqual([disliker.id]);
        expect(dislikes.likeCount).toBe(1);
        expect(dislikes.dislikeCount).toBe(1);
      });

      it('follows a switch and a removal', async () => {
        const { id } = await newTarget();
        const user = await data.createUser('user');

        await react(user, kind, id, 'like').expect(200);
        expect((await listReactors(id)).items).toEqual([
          { user: { id: user.id, fullName: user.fullName }, type: 'like' },
        ]);

        await react(user, kind, id, 'dislike').expect(200);
        const switched = await listReactors(id);
        expect(switched.items).toEqual([
          { user: { id: user.id, fullName: user.fullName }, type: 'dislike' },
        ]);
        expect(switched).toMatchObject({ likeCount: 0, dislikeCount: 1 });
        expect((await listReactors(id, '?type=like')).items).toEqual([]);

        await react(user, kind, id, 'dislike').expect(200);
        expect(await listReactors(id)).toEqual({
          items: [],
          likeCount: 0,
          dislikeCount: 0,
        });
      });

      it('answers the same for a signed-in reader, an admin and anonymous', async () => {
        const { id } = await newTarget();
        const reactor = await data.createUser('user');
        const admin = await data.createUser('admin');
        await react(reactor, kind, id, 'like').expect(200);

        const anonymous = await listReactors(id);
        for (const cookie of [reactor.cookie, admin.cookie]) {
          const res = await http()
            .get(reactorsPath(id))
            .set('Cookie', cookie)
            .expect(200);
          expect(res.body.data).toEqual(anonymous);
        }
      });

      it('shows a deleted account as the Deleted user placeholder, still counted', async () => {
        const { id } = await newTarget();
        const leaver = await data.createUser('user');
        await react(leaver, kind, id, 'like').expect(200);
        // Reaction rows are not removed with the account (a known limitation),
        // so the row outlives the user.
        await data.models.user.deleteOne({ _id: leaver.id });

        const list = await listReactors(id);

        expect(list.items).toEqual([
          {
            user: { id: null, fullName: 'Deleted user', headline: null },
            type: 'like',
          },
        ]);
        expect(list.likeCount).toBe(1);
      });

      it('400s a malformed id, an unknown type and an unknown query parameter', async () => {
        const { id } = await newTarget();

        await http().get(reactorsPath('not-an-id')).expect(400);
        await http().get(`${reactorsPath(id)}?type=love`).expect(400);
        await http().get(`${reactorsPath(id)}?limit=5`).expect(400);
      });

      it('404s a target that does not exist and one that has been deleted', async () => {
        await http()
          .get(reactorsPath(new Types.ObjectId().toString()))
          .expect(404);

        const { author, postId, id } = await newTarget();
        await http()
          .delete(kind === 'post' ? `/posts/${postId}` : `/comments/${id}`)
          .set('Cookie', author.cookie)
          .send({})
          .expect(200);

        await http().get(reactorsPath(id)).expect(404);
      });
    });
  });

  describe('myReaction on reads', () => {
    it('is null for an anonymous reader and for a bad cookie, without failing the request', async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);
      const reactor = await data.createUser('user');
      await react(reactor, 'post', postId, 'like').expect(200);

      const anonymous = await http().get(`/posts/${postId}`).expect(200);
      expect(anonymous.body.data.myReaction).toBeNull();
      expect(anonymous.body.data.likeCount).toBe(1);

      const garbage = await http()
        .get(`/posts/${postId}`)
        .set('Cookie', 'access_token=not-a-real-token')
        .expect(200);
      expect(garbage.body.data.myReaction).toBeNull();
    });

    it("shows each reader their own reaction on the post detail and after an edit", async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);
      const fan = await data.createUser('user');
      const critic = await data.createUser('user');
      await react(fan, 'post', postId, 'like').expect(200);
      await react(critic, 'post', postId, 'dislike').expect(200);
      await react(author, 'post', postId, 'like').expect(200);

      const read = async (user: E2eUser) =>
        (
          await http()
            .get(`/posts/${postId}`)
            .set('Cookie', user.cookie)
            .expect(200)
        ).body.data;
      expect((await read(fan)).myReaction).toBe('like');
      expect((await read(critic)).myReaction).toBe('dislike');
      expect(await read(fan)).toMatchObject({ likeCount: 2, dislikeCount: 1 });

      // The edit response is the full post, so it carries the author's own.
      const edited = await http()
        .patch(`/posts/${postId}`)
        .set('Cookie', author.cookie)
        .send({ title: 'edited title' })
        .expect(200);
      expect(edited.body.data.myReaction).toBe('like');
    });

    it('a just-created post has myReaction null', async () => {
      const author = await data.createUser('user');
      const res = await http()
        .post('/posts')
        .set('Cookie', author.cookie)
        .send({ title: 'fresh', body: 'fresh post' })
        .expect(201);
      data.trackPost(res.body.data.id);

      expect(res.body.data.myReaction).toBeNull();
    });

    it("gives every post on a feed page its own answer for the caller", async () => {
      const author = await data.createUser('user');
      const [p1, p2, p3] = [
        await createPost(author, 'feed 1'),
        await createPost(author, 'feed 2'),
        await createPost(author, 'feed 3'),
      ];
      const reader = await data.createUser('user');
      await react(reader, 'post', p1, 'like').expect(200);
      await react(reader, 'post', p3, 'dislike').expect(200);

      const res = await http()
        .get(`/posts?authorId=${author.id}&limit=10`)
        .set('Cookie', reader.cookie)
        .expect(200);
      const byId = new Map<string, { myReaction: string | null }>(
        res.body.data.items.map((p: { id: string; myReaction: string | null }) => [
          p.id,
          p,
        ]),
      );

      expect(byId.get(p1)!.myReaction).toBe('like');
      expect(byId.get(p2)!.myReaction).toBeNull();
      expect(byId.get(p3)!.myReaction).toBe('dislike');

      // Same page, anonymous: nothing is theirs.
      const anon = await http()
        .get(`/posts?authorId=${author.id}&limit=10`)
        .expect(200);
      expect(
        anon.body.data.items.map((p: { myReaction: unknown }) => p.myReaction),
      ).toEqual([null, null, null]);
    });

    it("carries counters and each reader's own reaction through the comment tree, replies included", async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);
      const rootId = await createComment(author, postId);
      const replyRes = await http()
        .post(`/posts/${postId}/comments`)
        .set('Cookie', author.cookie)
        .send({ body: 'a reply', parentCommentId: rootId })
        .expect(201);
      const replyId: string = replyRes.body.data.id;
      data.trackComment(replyId);
      // A brand-new comment starts with nothing.
      expect(replyRes.body.data).toMatchObject({
        likeCount: 0,
        dislikeCount: 0,
        myReaction: null,
      });

      const reader = await data.createUser('user');
      const other = await data.createUser('user');
      await react(reader, 'comment', rootId, 'like').expect(200);
      await react(reader, 'comment', replyId, 'dislike').expect(200);
      await react(other, 'comment', rootId, 'like').expect(200);

      const tree = async (cookie?: string) => {
        const req = http().get(`/posts/${postId}/comments`);
        const res = await (cookie ? req.set('Cookie', cookie) : req).expect(200);
        return res.body.data as Array<{
          id: string;
          likeCount: number;
          dislikeCount: number;
          myReaction: string | null;
          replies: Array<{
            id: string;
            dislikeCount: number;
            myReaction: string | null;
          }>;
        }>;
      };

      const [root] = await tree(reader.cookie);
      expect(root).toMatchObject({ likeCount: 2, myReaction: 'like' });
      expect(root.replies[0]).toMatchObject({
        dislikeCount: 1,
        myReaction: 'dislike',
      });

      const [otherRoot] = await tree(other.cookie);
      expect(otherRoot.myReaction).toBe('like');
      expect(otherRoot.replies[0].myReaction).toBeNull();

      const [anonRoot] = await tree();
      expect(anonRoot.likeCount).toBe(2);
      expect(anonRoot.myReaction).toBeNull();
      expect(anonRoot.replies[0].myReaction).toBeNull();
    });
  });
});
