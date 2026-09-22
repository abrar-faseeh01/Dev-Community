import { INestApplication, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Types } from 'mongoose';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

describeE2e('comments API', () => {
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
      .send({ title: 'e2e post', body: 'a post to comment on' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackPost(id);
    return id;
  }

  const postDoc = (postId: string) =>
    data.models.post.findById(postId).lean().exec();
  const commentCountOf = async (postId: string) =>
    (await postDoc(postId))!.commentCount;
  // Mongoose adds updatedAt through `timestamps: true`; the Post class does
  // not declare it, so it is read through a cast.
  const updatedAtOf = async (postId: string) =>
    ((await postDoc(postId)) as unknown as { updatedAt: Date }).updatedAt;
  const storedCommentsOn = (postId: string) =>
    data.models.comment.countDocuments({ postId });

  // A post by one user and a second user who will comment on it.
  async function postAndCommenter() {
    const postAuthor = await data.createUser('user');
    const commenter = await data.createUser('user');
    const postId = await createPost(postAuthor);
    return { postAuthor, commenter, postId };
  }

  const comment = (postId: string, user: E2eUser, body: unknown) =>
    http()
      .post(`/posts/${postId}/comments`)
      .set('Cookie', user.cookie)
      .send(body as object);

  // Creates a comment (a reply if a parent is given) and returns its id.
  async function say(
    postId: string,
    user: E2eUser,
    body: string,
    parentCommentId?: string,
  ) {
    const res = await comment(postId, user, {
      body,
      ...(parentCommentId ? { parentCommentId } : {}),
    }).expect(201);
    return res.body.data.id as string;
  }

  describe('POST /posts/:postId/comments — create a top-level comment', () => {
    it('creates it: 201 in the node shape, with the author populated', async () => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, { body: 'First!' }).expect(201);

      expect(res.body.success).toBe(true);
      const node = res.body.data;
      expect(Object.keys(node).sort()).toEqual([
        'author',
        'body',
        'createdAt',
        'id',
        'parentCommentId',
        'postId',
        'replies',
        'updatedAt',
      ]);
      expect(node).toMatchObject({
        postId,
        parentCommentId: null,
        body: 'First!',
        replies: [],
        author: { id: commenter.id, fullName: commenter.fullName },
      });
      expect(new Date(node.createdAt).toString()).not.toBe('Invalid Date');
      // Never edited yet: the two timestamps start out identical.
      expect(node.updatedAt).toBe(node.createdAt);
      data.trackComment(node.id);
    });

    it('stores it as a top-level comment: null parent, empty path, not deleted', async () => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, { body: 'Stored shape' }).expect(201);

      const stored = await data.models.comment.findById(res.body.data.id).lean();
      expect(String(stored!.postId)).toBe(postId);
      expect(String(stored!.authorId)).toBe(commenter.id);
      expect(stored!.parentCommentId).toBeNull();
      expect(stored!.ancestorIds).toEqual([]);
      expect(stored!.deletedAt).toBeNull();
      expect(stored!.body).toBe('Stored shape');
      expect(stored).toHaveProperty('createdAt');
      // Tracks edits now (Comment uses full timestamps), starting equal to
      // createdAt for a brand-new, never-edited comment.
      const timestamps = stored as unknown as { createdAt: Date; updatedAt: Date };
      expect(timestamps.updatedAt.getTime()).toBe(timestamps.createdAt.getTime());
    });

    it('trims the body before storing it', async () => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, {
        body: '   padded   \n',
      }).expect(201);

      expect(res.body.data.body).toBe('padded');
    });

    it('accepts an explicit null parentCommentId as a top-level comment', async () => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, {
        body: 'Explicit null',
        parentCommentId: null,
      }).expect(201);

      expect(res.body.data.parentCommentId).toBeNull();
    });

    it('accepts exactly 2000 characters', async () => {
      const { commenter, postId } = await postAndCommenter();

      await comment(postId, commenter, { body: 'x'.repeat(2000) }).expect(201);
    });

    it('lets the post\'s own author comment on their post', async () => {
      const { postAuthor, postId } = await postAndCommenter();

      await comment(postId, postAuthor, { body: 'Replying to myself' }).expect(201);
    });
  });

  describe('commentCount', () => {
    it('goes up by one per comment, exactly', async () => {
      const { commenter, postId } = await postAndCommenter();
      expect(await commentCountOf(postId)).toBe(0);

      await comment(postId, commenter, { body: 'one' }).expect(201);
      expect(await commentCountOf(postId)).toBe(1);

      await comment(postId, commenter, { body: 'two' }).expect(201);
      expect(await commentCountOf(postId)).toBe(2);
    });

    it('matches the number of live comments stored', async () => {
      const { commenter, postId } = await postAndCommenter();

      await comment(postId, commenter, { body: 'a' }).expect(201);
      await comment(postId, commenter, { body: 'b' }).expect(201);
      await comment(postId, commenter, { body: 'c' }).expect(201);

      expect(await commentCountOf(postId)).toBe(await storedCommentsOn(postId));
    });

    it('is exposed on the post\'s own responses', async () => {
      const { commenter, postId } = await postAndCommenter();
      await comment(postId, commenter, { body: 'visible count' }).expect(201);

      const res = await http().get(`/posts/${postId}`).expect(200);

      expect(res.body.data.commentCount).toBe(1);
    });

    it('does not change the post\'s updatedAt', async () => {
      const { commenter, postId } = await postAndCommenter();
      const before = await updatedAtOf(postId);

      await comment(postId, commenter, { body: 'one' }).expect(201);
      await comment(postId, commenter, { body: 'two' }).expect(201);

      const after = await updatedAtOf(postId);
      expect(after.getTime()).toBe(before.getTime());
    });
  });

  describe('who may comment', () => {
    it('rejects an anonymous visitor: 401', async () => {
      const { postId } = await postAndCommenter();

      const res = await http()
        .post(`/posts/${postId}/comments`)
        .send({ body: 'anonymous' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(await storedCommentsOn(postId)).toBe(0);
    });

    it('rejects an admin: 403, and nothing is stored', async () => {
      const { postId } = await postAndCommenter();
      const admin = await data.createUser('admin');

      const res = await comment(postId, admin, { body: 'admins do not author' }).expect(403);

      expect(res.body.message).toBe('Insufficient role');
      expect(await storedCommentsOn(postId)).toBe(0);
      expect(await commentCountOf(postId)).toBe(0);
    });

    it('rejects an admin before it looks at the body: 403 even for an invalid one', async () => {
      const { postId } = await postAndCommenter();
      const admin = await data.createUser('admin');

      await comment(postId, admin, {}).expect(403);
    });
  });

  describe('validation', () => {
    const rejected: [string, unknown][] = [
      ['a missing body', {}],
      ['an empty body', { body: '' }],
      ['a whitespace-only body', { body: ' \t\n ' }],
      ['a 2001-character body', { body: 'x'.repeat(2001) }],
      ['a non-string body', { body: 42 }],
      ['a client-supplied authorId', { body: 'x', authorId: '64f1c2e5a1b2c3d4e5f6a7c0' }],
      ['a client-supplied postId', { body: 'x', postId: '64f1c2e5a1b2c3d4e5f6a7c0' }],
      ['a malformed parentCommentId', { body: 'x', parentCommentId: 'not-an-id' }],
    ];

    it.each(rejected)('rejects %s with a 400 and stores nothing', async (_name, body) => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, body).expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(await storedCommentsOn(postId)).toBe(0);
      expect(await commentCountOf(postId)).toBe(0);
    });

    it('rejects a malformed postId with a 400, not a 500', async () => {
      const commenter = await data.createUser('user');

      const res = await http()
        .post('/posts/not-an-id/comments')
        .set('Cookie', commenter.cookie)
        .send({ body: 'x' })
        .expect(400);

      expect(res.body.message).toContain('is not a valid id');
    });
  });

  describe('the post must exist', () => {
    it('returns 404 for a post that does not exist', async () => {
      const commenter = await data.createUser('user');
      const missing = new Types.ObjectId().toHexString();

      const res = await comment(missing, commenter, { body: 'nowhere' }).expect(404);

      expect(res.body.message).toBe('Post not found');
    });

    it('returns 404 for a soft-deleted post, and stores nothing', async () => {
      const { postAuthor, commenter, postId } = await postAndCommenter();
      await http()
        .delete(`/posts/${postId}`)
        .set('Cookie', postAuthor.cookie)
        .send({})
        .expect(200);

      await comment(postId, commenter, { body: 'too late' }).expect(404);

      expect(await storedCommentsOn(postId)).toBe(0);
    });
  });

  // A reply is the same POST with a parentCommentId. The path each comment
  // stores (ancestorIds) is what depth and, later, the cascade delete are
  // built on, so these tests read it back from the database rather than
  // trusting the response.
  describe('replies', () => {
    const storedPath = async (commentId: string) =>
      (await data.models.comment.findById(commentId).lean())!.ancestorIds.map(
        String,
      );

    it('creates a reply: 201, the parent recorded, the replier as author', async () => {
      const { postAuthor, commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, postAuthor, 'the question');

      const res = await comment(postId, commenter, {
        body: 'the answer',
        parentCommentId: rootId,
      }).expect(201);

      expect(res.body.data).toMatchObject({
        postId,
        parentCommentId: rootId,
        body: 'the answer',
        replies: [],
        author: { id: commenter.id, fullName: commenter.fullName },
      });
    });

    it('stores a reply to a top-level comment with a one-entry path', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');

      const replyId = await say(postId, commenter, 'reply', rootId);

      expect(await storedPath(rootId)).toEqual([]);
      expect(await storedPath(replyId)).toEqual([rootId]);
    });

    it('stores a reply to a reply with the full path, root first', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'depth 1');
      const midId = await say(postId, commenter, 'depth 2', rootId);

      const leafId = await say(postId, commenter, 'depth 3', midId);

      expect(await storedPath(leafId)).toEqual([rootId, midId]);
    });

    it('gives sibling replies the same path', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');

      const a = await say(postId, commenter, 'first reply', rootId);
      const b = await say(postId, commenter, 'second reply', rootId);

      expect(await storedPath(a)).toEqual(await storedPath(b));
    });

    it('counts replies in commentCount, exactly like top-level comments', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');
      const midId = await say(postId, commenter, 'mid', rootId);
      await say(postId, commenter, 'leaf', midId);

      expect(await commentCountOf(postId)).toBe(3);
      expect(await commentCountOf(postId)).toBe(await storedCommentsOn(postId));
    });

    it('accepts a reply at any depth — there is no creation-time limit', async () => {
      const { commenter, postId } = await postAndCommenter();
      let parentId: string | undefined;
      const chain: string[] = [];

      // Ten levels deep, well past where the display would ever flatten —
      // every single one is still a plain 201.
      for (let level = 1; level <= 10; level++) {
        const res = await comment(postId, commenter, {
          body: `depth ${level}`,
          parentCommentId: parentId,
        }).expect(201);
        chain.push(res.body.data.id);
        parentId = res.body.data.id;
      }

      expect(new Set(chain).size).toBe(10);
      expect(await storedCommentsOn(postId)).toBe(10);
      expect(await commentCountOf(postId)).toBe(10);
    });

    it("stores the real parent chain even past the display's flatten point", async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'depth 1');
      const midId = await say(postId, commenter, 'depth 2', rootId);
      const leafId = await say(postId, commenter, 'depth 3', midId);

      const deeperId = await say(postId, commenter, 'depth 4', leafId);

      // ancestorIds is unaffected by how deep display flattening goes — it
      // always records the true, full chain up to the root.
      expect(await storedPath(deeperId)).toEqual([rootId, midId, leafId]);
    });

    it('rejects a parent that belongs to a different post: 400, nothing stored', async () => {
      const { commenter, postId } = await postAndCommenter();
      const other = await postAndCommenter();
      const foreignParent = await say(other.postId, other.commenter, 'on another post');

      const res = await comment(postId, commenter, {
        body: 'crossing posts',
        parentCommentId: foreignParent,
      }).expect(400);

      expect(res.body.message).toBe(
        'The parent comment belongs to a different post',
      );
      expect(await storedCommentsOn(postId)).toBe(0);
      expect(await commentCountOf(postId)).toBe(0);
      // and the other post is untouched
      expect(await commentCountOf(other.postId)).toBe(1);
    });

    it('returns 404 for a parent that does not exist', async () => {
      const { commenter, postId } = await postAndCommenter();

      const res = await comment(postId, commenter, {
        body: 'orphan reply',
        parentCommentId: new Types.ObjectId().toHexString(),
      }).expect(404);

      expect(res.body.message).toBe('Parent comment not found');
      expect(await storedCommentsOn(postId)).toBe(0);
    });

    it('returns 404 for a soft-deleted parent, the same as a missing one', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'about to be deleted');
      // The delete route arrives in a later step, so the parent is
      // soft-deleted directly.
      await data.models.comment.updateOne(
        { _id: rootId },
        { $set: { deletedAt: new Date() } },
      );

      const res = await comment(postId, commenter, {
        body: 'too late',
        parentCommentId: rootId,
      }).expect(404);

      expect(res.body.message).toBe('Parent comment not found');
    });

    it('checks the post first: a reply on a missing post is a 404 for the post', async () => {
      const commenter = await data.createUser('user');

      const res = await comment(new Types.ObjectId().toHexString(), commenter, {
        body: 'nowhere',
        parentCommentId: new Types.ObjectId().toHexString(),
      }).expect(404);

      expect(res.body.message).toBe('Post not found');
    });

    it('looks the parent up with exactly one query on comments', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');
      const spy = jest.spyOn(data.models.comment, 'findOne');

      try {
        await comment(postId, commenter, {
          body: 'reply',
          parentCommentId: rootId,
        }).expect(201);
        // existence, same-post and depth all come from that single lookup
        expect(spy).toHaveBeenCalledTimes(1);

        spy.mockClear();
        await comment(postId, commenter, { body: 'top level' }).expect(201);
        // a top-level comment needs no parent lookup at all
        expect(spy).toHaveBeenCalledTimes(0);
      } finally {
        spy.mockRestore();
      }
    });

    it('rolls a reply back when the counter update fails, leaving its parent alone', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');
      const spy = jest
        .spyOn(data.models.post, 'updateOne')
        .mockImplementationOnce((() => {
          throw new Error('simulated: counter update failed');
        }) as never);

      try {
        await comment(postId, commenter, {
          body: 'will roll back',
          parentCommentId: rootId,
        }).expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(await storedCommentsOn(postId)).toBe(1);
      expect(await commentCountOf(postId)).toBe(1);
    });
  });

  // The counter update is a second write after the insert, and there are no
  // transactions, so each way it can fail is forced here and the outcome
  // checked against the documented behaviour.
  describe('when the counter update fails', () => {
    it('rolls the comment back and reports the failure', async () => {
      const { commenter, postId } = await postAndCommenter();
      const spy = jest
        .spyOn(data.models.post, 'updateOne')
        .mockImplementationOnce((() => {
          throw new Error('simulated: counter update failed');
        }) as never);

      try {
        const res = await comment(postId, commenter, { body: 'will roll back' }).expect(500);
        expect(res.body.message).toBe(
          'The comment could not be saved. Please try again.',
        );
      } finally {
        spy.mockRestore();
      }

      expect(await storedCommentsOn(postId)).toBe(0);
      expect(await commentCountOf(postId)).toBe(0);
    });

    it('recounts from the truth when the rollback fails too, and the request succeeds', async () => {
      const { commenter, postId } = await postAndCommenter();
      await comment(postId, commenter, { body: 'already there' }).expect(201);
      // Put the counter out of step, so the recount visibly repairs it.
      await data.models.post.updateOne(
        { _id: postId },
        { $set: { commentCount: 7 } },
        { timestamps: false },
      );

      const incSpy = jest
        .spyOn(data.models.post, 'updateOne')
        .mockImplementationOnce((() => {
          throw new Error('simulated: counter update failed');
        }) as never);
      const deleteSpy = jest
        .spyOn(data.models.comment, 'deleteOne')
        .mockImplementationOnce((() => {
          throw new Error('simulated: rollback failed');
        }) as never);

      let created;
      try {
        created = await comment(postId, commenter, { body: 'kept anyway' }).expect(201);
      } finally {
        incSpy.mockRestore();
        deleteSpy.mockRestore();
      }

      // The comment exists and is counted; the 7 was replaced by the real 2.
      expect(created.body.data.body).toBe('kept anyway');
      expect(await storedCommentsOn(postId)).toBe(2);
      expect(await commentCountOf(postId)).toBe(2);
    });

    it('reports an error when every repair path fails', async () => {
      const { commenter, postId } = await postAndCommenter();
      const updateSpy = jest
        .spyOn(data.models.post, 'updateOne')
        .mockImplementation((() => {
          throw new Error('simulated: post updates are down');
        }) as never);
      const deleteSpy = jest
        .spyOn(data.models.comment, 'deleteOne')
        .mockImplementationOnce((() => {
          throw new Error('simulated: rollback failed');
        }) as never);

      try {
        const res = await comment(postId, commenter, { body: 'nothing works' }).expect(500);
        expect(res.body.success).toBe(false);
      } finally {
        updateSpy.mockRestore();
        deleteSpy.mockRestore();
      }
    });
  });

  // The read side. Threads are built through the real create route, so the
  // list is tested against what create actually stores, not against
  // hand-made rows.
  describe('GET /posts/:postId/comments — the comment tree', () => {
    const list = (postId: string) => http().get(`/posts/${postId}/comments`);

    type Node = {
      id: string;
      body: string;
      replies: Node[];
      author: { id: string | null; fullName: string; headline?: string | null };
    };
    const bodies = (nodes: Node[]) => nodes.map((n) => n.body);
    const flatten = (nodes: Node[]): Node[] =>
      nodes.flatMap((n) => [n, ...flatten(n.replies)]);

    // root A ─ a1 ─ a1x        root B        root C ─ c1
    //        └ a2
    async function buildThread() {
      const { commenter, postId } = await postAndCommenter();
      const a = await say(postId, commenter, 'A');
      const a1 = await say(postId, commenter, 'a1', a);
      await say(postId, commenter, 'a1x', a1);
      await say(postId, commenter, 'a2', a);
      await say(postId, commenter, 'B');
      const c = await say(postId, commenter, 'C');
      await say(postId, commenter, 'c1', c);
      return { commenter, postId, ids: { a, a1, c } };
    }

    it('is public: an anonymous visitor gets 200 in the envelope', async () => {
      const { postId } = await buildThread();

      const res = await list(postId).expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns an empty array for a post with no comments', async () => {
      const { postId } = await postAndCommenter();

      const res = await list(postId).expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('returns the correct hierarchy, top level and nested', async () => {
      const { postId } = await buildThread();

      const tree: Node[] = (await list(postId).expect(200)).body.data;

      // roots newest first: C, B, A — replies oldest first
      expect(bodies(tree)).toEqual(['C', 'B', 'A']);
      const [c, b, a] = tree;
      expect(bodies(c.replies)).toEqual(['c1']);
      expect(b.replies).toEqual([]);
      // a1x really replies to a1 (depth 3), but the display caps nesting at
      // depth 2: it lands as a direct, chronologically-placed sibling of a1
      // and a2 under A instead of nesting inside a1.
      expect(bodies(a.replies)).toEqual(['a1', 'a1x', 'a2']);
      // Nothing below a root ever nests further: whatever would have gone
      // inside a1's own replies was redirected to A instead.
      for (const reply of a.replies) {
        expect(reply.replies).toEqual([]);
      }
    });

    it('returns every live comment exactly once, matching commentCount', async () => {
      const { postId } = await buildThread();

      const tree: Node[] = (await list(postId).expect(200)).body.data;

      expect(flatten(tree)).toHaveLength(7);
      expect(new Set(flatten(tree).map((n) => n.id)).size).toBe(7);
      expect(flatten(tree)).toHaveLength(await commentCountOf(postId));
    });

    it('gives every node exactly the documented fields, and none of the internal ones', async () => {
      const { postId } = await buildThread();

      const res = await list(postId).expect(200);

      for (const node of flatten(res.body.data)) {
        expect(Object.keys(node).sort()).toEqual([
          'author',
          'body',
          'createdAt',
          'id',
          'parentCommentId',
          'postId',
          'replies',
          'updatedAt',
        ]);
      }
      const text = JSON.stringify(res.body);
      for (const internal of ['ancestorIds', 'deletedAt', '"__v"']) {
        expect(text).not.toContain(internal);
      }
    });

    it('sets parentCommentId on replies and null on top-level comments', async () => {
      const { postId, ids } = await buildThread();

      const tree: Node[] = (await list(postId).expect(200)).body.data;
      const byBody = Object.fromEntries(
        flatten(tree).map((n) => [n.body, n as Node & { parentCommentId: string | null }]),
      );

      expect(byBody['A'].parentCommentId).toBeNull();
      expect(byBody['a1'].parentCommentId).toBe(ids.a);
      expect(byBody['a1x'].parentCommentId).toBe(ids.a1);
      expect(byBody['c1'].parentCommentId).toBe(ids.c);
    });

    it('only includes comments from the requested post', async () => {
      const mine = await postAndCommenter();
      const other = await postAndCommenter();
      await say(mine.postId, mine.commenter, 'on my post');
      await say(other.postId, other.commenter, 'on the other post');

      const tree: Node[] = (await list(mine.postId).expect(200)).body.data;

      expect(bodies(flatten(tree))).toEqual(['on my post']);
    });

    describe('authors', () => {
      it('shows the author\'s name, and their headline once they have one', async () => {
        const { commenter, postId } = await postAndCommenter();
        await say(postId, commenter, 'before a headline');
        await data.models.user.updateOne(
          { _id: commenter.id },
          { $set: { headline: 'Staff Engineer' } },
        );
        await say(postId, commenter, 'after a headline');

        const tree: Node[] = (await list(postId).expect(200)).body.data;

        // Both comments render the author's *current* profile: it is
        // populated at read time, not copied onto the comment.
        for (const node of tree) {
          expect(node.author).toEqual({
            id: commenter.id,
            fullName: commenter.fullName,
            headline: 'Staff Engineer',
          });
        }
      });

      it('leaves headline out for an author who has none', async () => {
        const { commenter, postId } = await postAndCommenter();
        await say(postId, commenter, 'no headline');

        const tree: Node[] = (await list(postId).expect(200)).body.data;

        expect(tree[0].author).toEqual({
          id: commenter.id,
          fullName: commenter.fullName,
        });
      });

      it('never exposes the author\'s email, role or password hash', async () => {
        const { commenter, postId } = await postAndCommenter();
        await say(postId, commenter, 'privacy');

        const res = await list(postId).expect(200);

        const text = JSON.stringify(res.body);
        expect(text).not.toContain(commenter.email);
        expect(text).not.toContain('passwordHash');
        expect(text).not.toContain('"role"');
      });

      it('shows a placeholder for an author whose account was deleted, instead of failing', async () => {
        const { commenter, postId } = await postAndCommenter();
        const admin = await data.createUser('admin');
        const survivor = await data.createUser('user');
        await say(postId, commenter, 'from someone who left');
        await say(postId, survivor, 'from someone who stayed');
        await http()
          .delete(`/users/${commenter.id}`)
          .set('Cookie', admin.cookie)
          .send({})
          .expect(200);

        const res = await list(postId).expect(200);

        const byBody = Object.fromEntries(
          (res.body.data as Node[]).map((n) => [n.body, n]),
        );
        expect(byBody['from someone who left'].author).toEqual({
          id: null,
          fullName: 'Deleted user',
          headline: null,
        });
        expect(byBody['from someone who stayed'].author.id).toBe(survivor.id);
      });
    });

    describe('deleted comments', () => {
      // The delete route arrives in a later step, so these soft-delete
      // directly, the same way that route will.
      const softDelete = (id: string) =>
        data.models.comment.updateOne(
          { _id: id },
          { $set: { deletedAt: new Date() } },
        );

      it('leaves out a soft-deleted comment and keeps its live siblings', async () => {
        const { commenter, postId } = await postAndCommenter();
        const a = await say(postId, commenter, 'A');
        const gone = await say(postId, commenter, 'gone', a);
        await say(postId, commenter, 'kept', a);
        await softDelete(gone);

        const tree: Node[] = (await list(postId).expect(200)).body.data;

        expect(bodies(flatten(tree))).toEqual(['A', 'kept']);
      });

      it('drops an orphan — a live reply under a deleted parent — instead of promoting it', async () => {
        const { commenter, postId } = await postAndCommenter();
        const parent = await say(postId, commenter, 'parent');
        await say(postId, commenter, 'orphaned reply', parent);
        await say(postId, commenter, 'unrelated root');
        // Only the parent is flagged, as if a concurrent delete had raced
        // past the reply: the reply is still live, its parent is not.
        await softDelete(parent);

        const res = await list(postId).expect(200);

        const tree: Node[] = res.body.data;
        expect(bodies(tree)).toEqual(['unrelated root']);
        // not at the top level, and not anywhere else in the response
        expect(JSON.stringify(res.body)).not.toContain('orphaned reply');
      });

      it('drops a whole orphaned subtree', async () => {
        const { commenter, postId } = await postAndCommenter();
        const parent = await say(postId, commenter, 'parent');
        const child = await say(postId, commenter, 'child', parent);
        await say(postId, commenter, 'grandchild', child);
        await softDelete(parent);

        const res = await list(postId).expect(200);

        expect(res.body.data).toEqual([]);
      });
    });

    describe('the post', () => {
      it('returns 404 for a post that does not exist', async () => {
        const res = await list(new Types.ObjectId().toHexString()).expect(404);

        expect(res.body.message).toBe('Post not found');
      });

      it('returns 404 for a soft-deleted post', async () => {
        const { postAuthor, commenter, postId } = await postAndCommenter();
        await say(postId, commenter, 'about to be hidden');
        await http()
          .delete(`/posts/${postId}`)
          .set('Cookie', postAuthor.cookie)
          .send({})
          .expect(200);

        await list(postId).expect(404);
      });

      it('returns 400 for a malformed id, not a 500', async () => {
        const res = await http().get('/posts/not-an-id/comments').expect(400);

        expect(res.body.message).toContain('is not a valid id');
      });
    });

    it('reads every comment with a single query, however large the tree', async () => {
      const { postId } = await buildThread();
      const spy = jest.spyOn(data.models.comment, 'find');

      try {
        const res = await list(postId).expect(200);
        expect(flatten(res.body.data)).toHaveLength(7);
        // no query per parent, no per-level lookups
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // Deleting a comment soft-deletes it and every reply beneath it in one
  // atomic operation, then brings the post's counter back in line. These
  // tests read the database directly as well as the responses, because "the
  // whole subtree, and only the subtree" is a claim about stored rows.
  describe('DELETE /comments/:id — delete a comment and its replies', () => {
    const remove = (id: string, user?: E2eUser, body: object = {}) => {
      const req = http().delete(`/comments/${id}`);
      return (user ? req.set('Cookie', user.cookie) : req).send(body);
    };
    const list = (postId: string) => http().get(`/posts/${postId}/comments`);

    const storedDeletedAt = async (id: string) =>
      (await data.models.comment.findById(id).lean())!.deletedAt;
    const isDeleted = async (id: string) => (await storedDeletedAt(id)) !== null;
    const liveOn = (postId: string) =>
      data.models.comment.countDocuments({ postId, deletedAt: null });
    const setCount = (postId: string, commentCount: number) =>
      data.models.post.updateOne(
        { _id: postId },
        { $set: { commentCount } },
        { timestamps: false },
      );
    const updatedAtOf = async (postId: string) =>
      (
        (await data.models.post.findById(postId).lean()) as unknown as {
          updatedAt: Date;
        }
      ).updatedAt;

    // A ─ a1 ─ a1x        B
    //   └ a2
    async function buildThread() {
      const { commenter, postId, postAuthor } = await postAndCommenter();
      const a = await say(postId, commenter, 'A');
      const a1 = await say(postId, commenter, 'a1', a);
      const a1x = await say(postId, commenter, 'a1x', a1);
      const a2 = await say(postId, commenter, 'a2', a);
      const b = await say(postId, commenter, 'B');
      return { commenter, postAuthor, postId, ids: { a, a1, a1x, a2, b } };
    }

    // Spies on the logger for the whole test, so a "normal" delete can prove
    // it neither warned nor fell back to a repair.
    function watchLogger() {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const error = jest.spyOn(Logger.prototype, 'error');
      return {
        warn,
        error,
        restore: () => {
          warn.mockRestore();
          error.mockRestore();
        },
      };
    }

    describe('the cascade', () => {
      it('deletes a comment with no replies: 200, and deletedCount is 1', async () => {
        const { commenter, postId, ids } = await buildThread();

        const res = await remove(ids.b, commenter).expect(200);

        expect(res.body.success).toBe(true);
        expect(Object.keys(res.body.data).sort()).toEqual([
          'deletedAt',
          'deletedCount',
          'id',
        ]);
        expect(res.body.data.id).toBe(ids.b);
        expect(res.body.data.deletedCount).toBe(1);
        expect(await isDeleted(ids.b)).toBe(true);
        expect(await liveOn(postId)).toBe(4);
      });

      it('returns the same timestamp it stored', async () => {
        const { commenter, ids } = await buildThread();

        const res = await remove(ids.b, commenter).expect(200);

        expect((await storedDeletedAt(ids.b))!.toISOString()).toBe(
          res.body.data.deletedAt,
        );
      });

      it('deletes the whole subtree under a top-level comment, and only that', async () => {
        const { commenter, postId, ids } = await buildThread();
        const log = watchLogger();

        try {
          const res = await remove(ids.a, commenter).expect(200);

          expect(res.body.data.deletedCount).toBe(4); // A, a1, a1x, a2
          expect(log.warn).not.toHaveBeenCalled();
          expect(log.error).not.toHaveBeenCalled();
        } finally {
          log.restore();
        }

        for (const id of [ids.a, ids.a1, ids.a1x, ids.a2]) {
          expect(await isDeleted(id)).toBe(true);
        }
        expect(await isDeleted(ids.b)).toBe(false);
        expect(await liveOn(postId)).toBe(1);
      });

      it('deletes from the middle of a thread down, leaving what is above and beside', async () => {
        const { commenter, ids } = await buildThread();

        const res = await remove(ids.a1, commenter).expect(200);

        expect(res.body.data.deletedCount).toBe(2); // a1 and a1x
        expect(await isDeleted(ids.a1)).toBe(true);
        expect(await isDeleted(ids.a1x)).toBe(true);
        expect(await isDeleted(ids.a)).toBe(false);
        expect(await isDeleted(ids.a2)).toBe(false);
      });

      it('deleting a leaf reply touches nothing else', async () => {
        const { commenter, ids } = await buildThread();

        const res = await remove(ids.a1x, commenter).expect(200);

        expect(res.body.data.deletedCount).toBe(1);
        expect(await isDeleted(ids.a1)).toBe(false);
        expect(await isDeleted(ids.a)).toBe(false);
      });

      it('stamps the whole subtree with one and the same timestamp', async () => {
        const { commenter, ids } = await buildThread();

        await remove(ids.a, commenter).expect(200);

        const times = await Promise.all(
          [ids.a, ids.a1, ids.a1x, ids.a2].map(
            async (id) => (await storedDeletedAt(id))!.getTime(),
          ),
        );
        expect(new Set(times).size).toBe(1);
      });

      it('leaves other posts\' comments alone', async () => {
        const mine = await buildThread();
        const other = await buildThread();

        await remove(mine.ids.a, mine.commenter).expect(200);

        expect(await liveOn(other.postId)).toBe(5);
        expect(await isDeleted(other.ids.a)).toBe(false);
      });

      it('removes the branch from the list', async () => {
        const { commenter, postId, ids } = await buildThread();

        await remove(ids.a, commenter).expect(200);

        const tree = (await list(postId).expect(200)).body.data as { body: string }[];
        expect(tree.map((n) => n.body)).toEqual(['B']);
      });

      it('makes the comment unavailable as a reply target', async () => {
        const { commenter, postId, ids } = await buildThread();
        await remove(ids.a1, commenter).expect(200);

        const res = await comment(postId, commenter, {
          body: 'too late',
          parentCommentId: ids.a1,
        }).expect(404);

        expect(res.body.message).toBe('Parent comment not found');
      });

      it('does not bump updatedAt on the comments it soft-deletes', async () => {
        const { commenter, ids } = await buildThread();
        const updatedAtOfComment = async () =>
          (
            (await data.models.comment.findById(ids.a).lean()) as unknown as {
              updatedAt: Date;
            }
          ).updatedAt;
        const before = await updatedAtOfComment();

        await remove(ids.a, commenter).expect(200);

        expect((await updatedAtOfComment()).getTime()).toBe(before.getTime());
      });
    });

    describe('commentCount', () => {
      it('drops by exactly what was deleted and equals the live comments', async () => {
        const { commenter, postId, ids } = await buildThread();
        const commentCountOf = async () =>
          (await data.models.post.findById(postId).lean())!.commentCount;
        expect(await commentCountOf()).toBe(5);

        await remove(ids.a1, commenter).expect(200); // 2 rows
        expect(await commentCountOf()).toBe(3);

        await remove(ids.a, commenter).expect(200); // A and a2 remain: 2 rows
        expect(await commentCountOf()).toBe(1);
        expect(await commentCountOf()).toBe(await liveOn(postId));
      });

      it('is visible on the post\'s own response', async () => {
        const { commenter, postId, ids } = await buildThread();

        await remove(ids.a, commenter).expect(200);

        const res = await http().get(`/posts/${postId}`).expect(200);
        expect(res.body.data.commentCount).toBe(1);
      });

      it('does not change the post\'s updatedAt', async () => {
        const { commenter, postId, ids } = await buildThread();
        const before = await updatedAtOf(postId);

        await remove(ids.a, commenter).expect(200);

        expect((await updatedAtOf(postId)).getTime()).toBe(before.getTime());
      });

      it('never goes below zero, and says so when it had to clamp', async () => {
        const { commenter, postId, ids } = await buildThread();
        await setCount(postId, 0); // as if the counter had drifted
        const log = watchLogger();

        try {
          await remove(ids.b, commenter).expect(200);
          expect(log.warn).toHaveBeenCalledTimes(1);
          expect(String(log.warn.mock.calls[0][0])).toContain('clamped to 0');
        } finally {
          log.restore();
        }

        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(0);
      });

      it('clamps a partial shortfall too: count 1, four comments removed', async () => {
        const { commenter, postId, ids } = await buildThread();
        await setCount(postId, 1);

        await remove(ids.a, commenter).expect(200);

        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(0);
      });

      it('stays quiet when the count was right', async () => {
        const { commenter, ids } = await buildThread();
        const log = watchLogger();

        try {
          await remove(ids.b, commenter).expect(200);
          expect(log.warn).not.toHaveBeenCalled();
        } finally {
          log.restore();
        }
      });
    });

    describe('when the counter update fails', () => {
      it('repairs the count from the real comments, and the delete still succeeds', async () => {
        const { commenter, postId, ids } = await buildThread();
        await setCount(postId, 9); // wrong, so the repair is visible
        const spy = jest
          .spyOn(data.models.post, 'findOneAndUpdate')
          .mockImplementationOnce((() => {
            throw new Error('simulated: counter update failed');
          }) as never);

        try {
          const res = await remove(ids.a, commenter).expect(200);
          expect(res.body.data.deletedCount).toBe(4);
        } finally {
          spy.mockRestore();
        }

        // Recounted from the truth: B is the only live comment left.
        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(1);
        expect(await liveOn(postId)).toBe(1);
      });

      it('still reports success when the repair fails too, and logs it', async () => {
        const { commenter, postId, ids } = await buildThread();
        await setCount(postId, 9);
        const decrement = jest
          .spyOn(data.models.post, 'findOneAndUpdate')
          .mockImplementationOnce((() => {
            throw new Error('simulated: counter update failed');
          }) as never);
        const recount = jest
          .spyOn(data.models.post, 'updateOne')
          .mockImplementationOnce((() => {
            throw new Error('simulated: recount failed');
          }) as never);
        const log = watchLogger();

        try {
          // The rows really were deleted, so the client is told so.
          const res = await remove(ids.a, commenter).expect(200);
          expect(res.body.data.deletedCount).toBe(4);
          expect(log.error).toHaveBeenCalledTimes(2);
        } finally {
          decrement.mockRestore();
          recount.mockRestore();
          log.restore();
        }

        expect(await isDeleted(ids.a)).toBe(true);
        // Nothing repaired it, which is exactly why it was logged.
        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(9);
      });
    });

    describe('a repeat or concurrent delete', () => {
      it('returns 404 the second time, and does not touch the counter again', async () => {
        const { commenter, postId, ids } = await buildThread();
        await remove(ids.a, commenter).expect(200);
        const after = (await data.models.post.findById(postId).lean())!.commentCount;

        const res = await remove(ids.a, commenter).expect(404);

        expect(res.body.message).toBe('Comment not found');
        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(after);
      });

      it('returns 404, with the counter untouched, when a concurrent delete already got there', async () => {
        const { commenter, postId, ids } = await buildThread();
        // The fetch succeeds and then the write changes nothing: exactly what
        // the caller sees when another request deleted the subtree in between.
        const write = jest
          .spyOn(data.models.comment, 'updateMany')
          .mockResolvedValueOnce({ modifiedCount: 0 } as never);
        const counter = jest.spyOn(data.models.post, 'findOneAndUpdate');

        try {
          const res = await remove(ids.b, commenter).expect(404);
          expect(res.body.message).toBe('Comment not found');
          expect(counter).not.toHaveBeenCalled();
        } finally {
          write.mockRestore();
          counter.mockRestore();
        }

        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(5);
      });

      // The rule the overlap test below depends on, checked without any race:
      // once a subtree is deleted, a second write against it must change
      // nothing. `deletedAt: null` in the cascade's filter is what guarantees
      // it. The service is called directly, twice, with the same comment the
      // first call fetched — exactly the state a slow concurrent request is in.
      it('a second cascade against an already-deleted subtree changes nothing and subtracts nothing', async () => {
        const { postId, ids } = await buildThread();
        const { CommentsService } = await import('../src/comments/comments.service.js');
        const service = app.get(CommentsService, { strict: false });
        const fetched = await service.findLiveById(ids.a);

        const first = await service.removeWithReplies(fetched);
        expect(first.deletedCount).toBe(4);
        const stampedAt = (await storedDeletedAt(ids.a))!.getTime();

        await expect(service.removeWithReplies(fetched)).rejects.toThrow(
          'Comment not found',
        );

        // Not re-flipped (the timestamp would change), not subtracted again.
        expect((await storedDeletedAt(ids.a))!.getTime()).toBe(stampedAt);
        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(1);
      });

      // What is and is not guaranteed when deletes of the same subtree truly
      // overlap. updateMany is atomic per DOCUMENT, not across the whole call
      // (there are no transactions here), so two overlapping deletes can each
      // flip part of the subtree: more than one request may return 200, each
      // reporting only the rows it changed. What IS guaranteed — and what the
      // counter depends on — is that every row is flipped by exactly one
      // request, because `deletedAt: null` in the filter stops a second request
      // matching a row the first already flipped. So the counts add up to the
      // subtree size and commentCount drops by exactly that, never more.
      //
      // A barrier holds every request just before its write and releases them
      // together, so the writes genuinely overlap instead of arriving one after
      // another, which is what happens most of the time without it.
      it('counts every row exactly once when deletes of the same subtree overlap', async () => {
        const { commenter, postId, ids } = await buildThread();
        const { CommentsService } = await import('../src/comments/comments.service.js');
        const service = app.get(CommentsService, { strict: false });
        const original = service.removeWithReplies.bind(service);
        const callers = 6;
        let arrived = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const spy = jest
          .spyOn(service, 'removeWithReplies')
          .mockImplementation((async (target: never) => {
            if (++arrived === callers) release();
            await gate;
            return original(target);
          }) as never);

        let responses;
        try {
          responses = await Promise.all(
            Array.from({ length: callers }, () => remove(ids.a, commenter)),
          );
        } finally {
          spy.mockRestore();
        }

        // Only ever a clean 200 or a clean 404.
        expect(responses.map((r) => r.status).every((s) => s === 200 || s === 404)).toBe(true);
        const winners = responses.filter((r) => r.status === 200);
        expect(winners.length).toBeGreaterThanOrEqual(1);
        // Whoever won, together they account for the whole subtree exactly once.
        const total = winners.reduce((sum, r) => sum + r.body.data.deletedCount, 0);
        expect(total).toBe(4);
        for (const id of [ids.a, ids.a1, ids.a1x, ids.a2]) {
          expect(await isDeleted(id)).toBe(true);
        }
        expect(await isDeleted(ids.b)).toBe(false);
        // Subtracted once per row, not once per request.
        expect((await data.models.post.findById(postId).lean())!.commentCount).toBe(1);
        expect(await liveOn(postId)).toBe(1);
      });
    });

    describe('who may delete', () => {
      it('lets the comment\'s author delete it', async () => {
        const { commenter, ids } = await buildThread();

        await remove(ids.b, commenter).expect(200);
      });

      it('lets an admin delete anyone\'s comment', async () => {
        const { postId, ids } = await buildThread();
        const admin = await data.createUser('admin');

        await remove(ids.a, admin).expect(200);

        expect(await liveOn(postId)).toBe(1);
      });

      it('lets an admin delete a comment whose author\'s account no longer exists', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');
        await http()
          .delete(`/users/${commenter.id}`)
          .set('Cookie', admin.cookie)
          .send({})
          .expect(200);

        await remove(ids.b, admin).expect(200);
      });

      it('rejects a signed-in user who is not the author: 403, and nothing is deleted', async () => {
        const { postId, ids } = await buildThread();
        const stranger = await data.createUser('user');

        const res = await remove(ids.a, stranger).expect(403);

        expect(res.body.message).toBe(
          'You can only delete your own comments or comments on your own posts',
        );
        expect(await liveOn(postId)).toBe(5);
        expect(
          (await data.models.post.findById(postId).lean())!.commentCount,
        ).toBe(5);
      });

      it('rejects an anonymous request: 401', async () => {
        const { postId, ids } = await buildThread();

        await remove(ids.a).expect(401);

        expect(await liveOn(postId)).toBe(5);
      });
    });

    // A post's author controls the discussion under their own post: they may
    // remove anyone's comment there, and only there. It is a quiet action —
    // nothing is audit-logged and the comment's author is not notified.
    describe('the post\'s author', () => {
      const auditFor = (targetUserId: string) =>
        data.models.auditLog
          .find({ targetUserId, action: 'delete_comment' })
          .lean()
          .exec();
      const notesFor = (userId: string) =>
        data.models.notification.find({ userId }).lean().exec();

      it('may delete someone else\'s comment on their own post, replies and all', async () => {
        const { commenter, postAuthor, postId, ids } = await buildThread();

        const res = await remove(ids.a, postAuthor).expect(200);

        expect(res.body.data.deletedCount).toBe(4);
        expect(await isDeleted(ids.a)).toBe(true);
        expect(await isDeleted(ids.a1x)).toBe(true);
        expect(await liveOn(postId)).toBe(1);
        expect(
          (await data.models.post.findById(postId).lean())!.commentCount,
        ).toBe(1);
        expect(commenter.id).not.toBe(postAuthor.id);
      });

      it('leaves no audit entry and tells nobody', async () => {
        const { commenter, postAuthor, ids } = await buildThread();

        await remove(ids.a, postAuthor).expect(200);

        expect(await auditFor(commenter.id)).toHaveLength(0);
        expect(await notesFor(commenter.id)).toHaveLength(0);
      });

      it('may not delete a comment on someone else\'s post', async () => {
        const { ids, postId } = await buildThread();
        const otherPost = await postAndCommenter();

        const res = await remove(ids.a, otherPost.postAuthor).expect(403);

        expect(res.body.message).toBe(
          'You can only delete your own comments or comments on your own posts',
        );
        expect(await liveOn(postId)).toBe(5);
      });

      it('may not delete a comment once their post is gone', async () => {
        const { postAuthor, commenter, ids } = await buildThread();
        // A soft-deleted post grants nothing: its author is looked up with
        // the normal live filter.
        await data.models.post.updateOne(
          { _id: (await data.models.comment.findById(ids.a).lean())!.postId },
          { $set: { deletedAt: new Date() } },
        );

        await remove(ids.a, postAuthor).expect(403);
        // …while the comment's own author still may.
        await remove(ids.a, commenter).expect(200);
      });

      it('looks the post up only when it has to', async () => {
        const { commenter, postAuthor, ids } = await buildThread();
        const admin = await data.createUser('admin');
        const stranger = await data.createUser('user');
        const spy = jest.spyOn(data.models.post, 'findOne');

        try {
          await remove(ids.b, commenter).expect(200); // the author
          expect(spy).toHaveBeenCalledTimes(0);

          await remove(ids.a2, admin).expect(200); // an admin
          expect(spy).toHaveBeenCalledTimes(0);

          await remove(ids.a1, stranger).expect(403); // neither: must look
          expect(spy).toHaveBeenCalledTimes(1);

          spy.mockClear();
          await remove(ids.a1, postAuthor).expect(200); // the post's author
          expect(spy).toHaveBeenCalledTimes(1);
        } finally {
          spy.mockRestore();
        }
      });
    });

    // An admin deleting someone else's comment is the one case that is
    // recorded and announced.
    describe('an admin deleting someone else\'s comment', () => {
      const auditFor = (targetUserId: string) =>
        data.models.auditLog
          .find({ targetUserId, action: 'delete_comment' })
          .lean()
          .exec();
      const notesFor = (userId: string) =>
        data.models.notification.find({ userId }).lean().exec();

      it('writes one audit entry that says what was deleted and how much', async () => {
        const { commenter, postId, ids } = await buildThread();
        const admin = await data.createUser('admin');

        await remove(ids.a, admin, { reason: 'off topic' }).expect(200);

        const entries = await auditFor(commenter.id);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          action: 'delete_comment',
          targetFullName: commenter.fullName,
          adminFullName: admin.fullName,
          reason: 'off topic',
          previousState: { commentId: ids.a, postId },
          newState: { deletedCount: 4 },
        });
        expect(String(entries[0].adminId)).toBe(admin.id);
        expect(String(entries[0].targetUserId)).toBe(commenter.id);
      });

      it('notifies the comment\'s author, with the reason appended', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');

        await remove(ids.a, admin, { reason: 'off topic' }).expect(200);

        const notes = await notesFor(commenter.id);
        expect(notes).toHaveLength(1);
        expect(notes[0].message).toBe(
          'An administrator deleted your comment. Reason: off topic',
        );
      });

      it('notifies without a reason when none was given', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');

        await remove(ids.b, admin).expect(200);

        const notes = await notesFor(commenter.id);
        expect(notes.map((n) => n.message)).toEqual([
          'An administrator deleted your comment.',
        ]);
        const [entry] = await auditFor(commenter.id);
        expect(entry).not.toHaveProperty('reason');
      });

      it('shows up in the admin audit log', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');
        await remove(ids.b, admin).expect(200);

        const res = await http()
          .get('/admin/audit-log')
          .set('Cookie', admin.cookie)
          .expect(200);

        const mine = (res.body.data as { targetUserId: string; action: string }[]).filter(
          (e) => e.targetUserId === commenter.id,
        );
        expect(mine.map((e) => e.action)).toEqual(['delete_comment']);
      });

      it('still audit-logs it, under "Deleted user", when the author\'s account is gone', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');
        await http()
          .delete(`/users/${commenter.id}`)
          .set('Cookie', admin.cookie)
          .send({})
          .expect(200);

        await remove(ids.b, admin).expect(200);

        const entries = await auditFor(commenter.id);
        expect(entries).toHaveLength(1);
        expect(entries[0].targetFullName).toBe('Deleted user');
        // nobody to tell
        expect(await notesFor(commenter.id)).toHaveLength(0);
      });

      it('leaves nothing behind when the delete found nothing to do: a repeat is a 404', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');
        await remove(ids.b, admin).expect(200);

        await remove(ids.b, admin).expect(404);

        expect(await auditFor(commenter.id)).toHaveLength(1);
        expect(await notesFor(commenter.id)).toHaveLength(1);
      });

      it('leaves nothing behind when a concurrent delete won the race', async () => {
        const { commenter, ids } = await buildThread();
        const admin = await data.createUser('admin');
        const write = jest
          .spyOn(data.models.comment, 'updateMany')
          .mockResolvedValueOnce({ modifiedCount: 0 } as never);

        try {
          await remove(ids.b, admin).expect(404);
        } finally {
          write.mockRestore();
        }

        expect(await auditFor(commenter.id)).toHaveLength(0);
        expect(await notesFor(commenter.id)).toHaveLength(0);
      });
    });

    describe('the author deleting their own comment', () => {
      it('is not audit-logged and notifies nobody', async () => {
        const { commenter, ids } = await buildThread();

        await remove(ids.a, commenter, { reason: 'ignored' }).expect(200);

        expect(
          await data.models.auditLog.countDocuments({
            targetUserId: commenter.id,
          }),
        ).toBe(0);
        expect(
          await data.models.notification.countDocuments({ userId: commenter.id }),
        ).toBe(0);
      });
    });

    describe('the request body', () => {
      it('rejects a non-string reason: 400, and nothing is deleted', async () => {
        const { commenter, postId, ids } = await buildThread();

        await remove(ids.b, commenter, { reason: 42 }).expect(400);

        expect(await liveOn(postId)).toBe(5);
      });

      it('rejects an unknown property: 400, and nothing is deleted', async () => {
        const { commenter, postId, ids } = await buildThread();

        await remove(ids.b, commenter, { deletedCount: 0 }).expect(400);

        expect(await liveOn(postId)).toBe(5);
      });
    });

    describe('the id', () => {
      it('returns 404 for a comment that does not exist', async () => {
        const user = await data.createUser('user');

        const res = await remove(new Types.ObjectId().toHexString(), user).expect(404);

        expect(res.body.message).toBe('Comment not found');
      });

      it('returns 400 for a malformed id, not a 500', async () => {
        const user = await data.createUser('user');

        const res = await remove('not-an-id', user).expect(400);

        expect(res.body.message).toContain('is not a valid id');
      });

      it('checks the comment before the caller\'s rights: a stranger learns only "not found" for a deleted one', async () => {
        const { commenter, ids } = await buildThread();
        const stranger = await data.createUser('user');
        await remove(ids.b, commenter).expect(200);

        await remove(ids.b, stranger).expect(404);
      });
    });
  });

  // Editing is stricter than deleting: the comment's own author, full stop —
  // no admin override, no post-owner override, no cascade to anything, and
  // no effect on commentCount or on where the comment sits in the tree.
  describe("PATCH /comments/:id — edit a comment's body", () => {
    const edit = (id: string, user: E2eUser | undefined, body: unknown) => {
      const req = http().patch(`/comments/${id}`);
      return (user ? req.set('Cookie', user.cookie) : req).send(body as object);
    };
    const storedComment = (id: string) =>
      data.models.comment.findById(id).lean();

    it("updates the body and returns {id, body, updatedAt} — not the full comment", async () => {
      const { commenter, postId } = await postAndCommenter();
      const created = await comment(postId, commenter, { body: 'original' }).expect(201);
      const id = created.body.data.id as string;
      data.trackComment(id);

      const res = await edit(id, commenter, { body: 'edited body' }).expect(200);

      expect(res.body.success).toBe(true);
      expect(Object.keys(res.body.data).sort()).toEqual(['body', 'id', 'updatedAt']);
      expect(res.body.data).toMatchObject({ id, body: 'edited body' });
    });

    it('actually persists the new body', async () => {
      const { commenter, postId } = await postAndCommenter();
      const created = await comment(postId, commenter, { body: 'original' }).expect(201);
      const id = created.body.data.id as string;

      await edit(id, commenter, { body: 'persisted edit' }).expect(200);

      expect((await storedComment(id))!.body).toBe('persisted edit');
    });

    it('trims the new body the same way create does', async () => {
      const { commenter, postId } = await postAndCommenter();
      const created = await comment(postId, commenter, { body: 'original' }).expect(201);
      const id = created.body.data.id as string;

      const res = await edit(id, commenter, { body: '  padded  \n' }).expect(200);

      expect(res.body.data.body).toBe('padded');
    });

    it('sets updatedAt away from createdAt, and the change is visible on GET', async () => {
      const { commenter, postId } = await postAndCommenter();
      const created = await comment(postId, commenter, { body: 'original' }).expect(201);
      const id = created.body.data.id as string;
      expect(created.body.data.updatedAt).toBe(created.body.data.createdAt);

      await edit(id, commenter, { body: 'now edited' }).expect(200);

      const tree = (await http().get(`/posts/${postId}/comments`).expect(200)).body.data;
      const node = tree[0];
      expect(node.body).toBe('now edited');
      expect(node.updatedAt).not.toBe(node.createdAt);
    });

    it('never touches parentCommentId, ancestorIds, postId, or authorId', async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');
      const replyId = await say(postId, commenter, 'reply', rootId);
      const before = await storedComment(replyId);

      await edit(replyId, commenter, { body: 'edited reply' }).expect(200);

      const after = await storedComment(replyId);
      expect(String(after!.postId)).toBe(String(before!.postId));
      expect(String(after!.parentCommentId)).toBe(String(before!.parentCommentId));
      expect(after!.ancestorIds.map(String)).toEqual(before!.ancestorIds.map(String));
      expect(String(after!.authorId)).toBe(String(before!.authorId));
    });

    it("does not empty a comment's real replies — the list still shows them after an edit", async () => {
      const { commenter, postId } = await postAndCommenter();
      const rootId = await say(postId, commenter, 'root');
      await say(postId, commenter, 'a real reply', rootId);

      await edit(rootId, commenter, { body: 'root, edited' }).expect(200);

      const tree = (await http().get(`/posts/${postId}/comments`).expect(200)).body.data;
      expect(tree[0].body).toBe('root, edited');
      expect(tree[0].replies).toHaveLength(1);
    });

    it('does not change commentCount', async () => {
      const { commenter, postId } = await postAndCommenter();
      const created = await comment(postId, commenter, { body: 'original' }).expect(201);
      const before = await commentCountOf(postId);

      await edit(created.body.data.id, commenter, { body: 'edited' }).expect(200);

      expect(await commentCountOf(postId)).toBe(before);
    });

    describe('who may edit', () => {
      it("rejects a stranger: 403, and the body is unchanged", async () => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);
        const stranger = await data.createUser('user');

        const res = await edit(created.body.data.id, stranger, { body: 'hijacked' }).expect(403);

        expect(res.body.message).toBe('You can only edit your own comments');
        expect((await storedComment(created.body.data.id))!.body).toBe('original');
      });

      it("rejects an admin — no override exists for editing, unlike delete", async () => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);
        const admin = await data.createUser('admin');

        const res = await edit(created.body.data.id, admin, { body: 'admin edit' }).expect(403);

        expect(res.body.message).toBe('You can only edit your own comments');
      });

      it("rejects the post's own author editing someone else's comment — no override, unlike delete", async () => {
        const { postAuthor, commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);

        await edit(created.body.data.id, postAuthor, { body: 'post owner edit' }).expect(403);
      });

      it('rejects an anonymous request: 401', async () => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);

        await edit(created.body.data.id, undefined, { body: 'no cookie' }).expect(401);
      });
    });

    describe('validation', () => {
      const rejected: [string, unknown][] = [
        ['a missing body', {}],
        ['an empty body', { body: '' }],
        ['a whitespace-only body', { body: ' \t\n ' }],
        ['a 2001-character body', { body: 'x'.repeat(2001) }],
        ['a non-string body', { body: 42 }],
      ];

      it.each(rejected)('rejects %s with 400, unchanged', async (_name, body) => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);

        const res = await edit(created.body.data.id, commenter, body).expect(400);

        expect(res.body.success).toBe(false);
        expect((await storedComment(created.body.data.id))!.body).toBe('original');
      });

      it('accepts exactly 2000 characters', async () => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);

        await edit(created.body.data.id, commenter, { body: 'x'.repeat(2000) }).expect(200);
      });
    });

    describe('the id', () => {
      it('returns 404 for a comment that does not exist', async () => {
        const user = await data.createUser('user');

        const res = await edit(new Types.ObjectId().toHexString(), user, { body: 'x' }).expect(404);

        expect(res.body.message).toBe('Comment not found');
      });

      it('returns 400 for a malformed id, not a 500', async () => {
        const user = await data.createUser('user');

        const res = await edit('not-an-id', user, { body: 'x' }).expect(400);

        expect(res.body.message).toContain('is not a valid id');
      });

      it("returns 404 for a comment that has already been deleted, even for its own author", async () => {
        const { commenter, postId } = await postAndCommenter();
        const created = await comment(postId, commenter, { body: 'original' }).expect(201);
        await http()
          .delete(`/comments/${created.body.data.id}`)
          .set('Cookie', commenter.cookie)
          .send({})
          .expect(200);

        const res = await edit(created.body.data.id, commenter, { body: 'too late' }).expect(404);

        expect(res.body.message).toBe('Comment not found');
      });
    });
  });
});
