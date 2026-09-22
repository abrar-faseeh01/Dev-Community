import { INestApplication, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// Deleting a post soft-deletes its comments. These tests read the stored rows
// as well as the responses, because the claim is about what is in the
// collection: nothing that later queries comments directly should have to
// remember to join back to the post.
describeE2e('deleting a post deletes its comments', () => {
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
      .send({ title: 'e2e post', body: 'a post that will be deleted' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackPost(id);
    return id;
  }

  async function say(
    postId: string,
    user: E2eUser,
    body: string,
    parentCommentId?: string,
  ) {
    const res = await http()
      .post(`/posts/${postId}/comments`)
      .set('Cookie', user.cookie)
      .send({ body, ...(parentCommentId ? { parentCommentId } : {}) })
      .expect(201);
    return res.body.data.id as string;
  }

  const deletePost = (postId: string, user: E2eUser, body: object = {}) =>
    http().delete(`/posts/${postId}`).set('Cookie', user.cookie).send(body);
  const commentRow = (id: string) =>
    data.models.comment.findById(id).lean().exec();
  const postRow = (id: string) => data.models.post.findById(id).lean().exec();

  // A ─ a1 ─ a1x        B
  async function threadedPost() {
    const postAuthor = await data.createUser('user');
    const commenter = await data.createUser('user');
    const postId = await createPost(postAuthor);
    const a = await say(postId, commenter, 'A');
    const a1 = await say(postId, commenter, 'a1', a);
    const a1x = await say(postId, postAuthor, 'a1x', a1);
    const b = await say(postId, commenter, 'B');
    return { postAuthor, commenter, postId, ids: { a, a1, a1x, b } };
  }

  describe('the cascade', () => {
    it('soft-deletes every comment on the post, replies included', async () => {
      const { postAuthor, postId, ids } = await threadedPost();

      const res = await deletePost(postId, postAuthor).expect(200);

      // the post's own response is unchanged
      expect(Object.keys(res.body.data).sort()).toEqual(['deletedAt', 'id']);
      for (const id of Object.values(ids)) {
        expect((await commentRow(id))!.deletedAt).not.toBeNull();
      }
    });

    it('stamps the comments with the post\'s own deletedAt', async () => {
      const { postAuthor, postId, ids } = await threadedPost();

      await deletePost(postId, postAuthor).expect(200);

      const postDeletedAt = (await postRow(postId))!.deletedAt!.getTime();
      for (const id of Object.values(ids)) {
        expect((await commentRow(id))!.deletedAt!.getTime()).toBe(postDeletedAt);
      }
    });

    it('leaves the comments of other posts alone', async () => {
      const mine = await threadedPost();
      const other = await threadedPost();

      await deletePost(mine.postId, mine.postAuthor).expect(200);

      for (const id of Object.values(other.ids)) {
        expect((await commentRow(id))!.deletedAt).toBeNull();
      }
      const stillListed = await http()
        .get(`/posts/${other.postId}/comments`)
        .expect(200);
      expect(stillListed.body.data).toHaveLength(2); // A and B at the top level
    });

    it('does not touch the post\'s commentCount', async () => {
      const { postAuthor, postId } = await threadedPost();
      expect((await postRow(postId))!.commentCount).toBe(4);

      await deletePost(postId, postAuthor).expect(200);

      // the number no longer describes anything anyone can read; adjusting it
      // would only add a write that could fail
      expect((await postRow(postId))!.commentCount).toBe(4);
    });

    it('does not re-stamp a comment that was already deleted', async () => {
      const { postAuthor, commenter, postId, ids } = await threadedPost();
      await http()
        .delete(`/comments/${ids.b}`)
        .set('Cookie', commenter.cookie)
        .send({})
        .expect(200);
      const deletedEarlier = (await commentRow(ids.b))!.deletedAt!.getTime();

      await deletePost(postId, postAuthor).expect(200);

      expect((await commentRow(ids.b))!.deletedAt!.getTime()).toBe(deletedEarlier);
      expect(deletedEarlier).not.toBe((await postRow(postId))!.deletedAt!.getTime());
      // …while the ones that were still live were stamped with the post's
      expect((await commentRow(ids.a))!.deletedAt!.getTime()).toBe(
        (await postRow(postId))!.deletedAt!.getTime(),
      );
    });

    it('works for a post with no comments at all', async () => {
      const postAuthor = await data.createUser('user');
      const postId = await createPost(postAuthor);

      await deletePost(postId, postAuthor).expect(200);

      await http().get(`/posts/${postId}`).expect(404);
    });
  });

  describe('afterwards the comments are unreachable', () => {
    it('the list is a 404, like the post itself', async () => {
      const { postAuthor, postId } = await threadedPost();
      await deletePost(postId, postAuthor).expect(200);

      const res = await http().get(`/posts/${postId}/comments`).expect(404);

      expect(res.body.message).toBe('Post not found');
    });

    it('deleting one is a 404 for its own author, and for the post\'s author', async () => {
      const { postAuthor, commenter, postId, ids } = await threadedPost();
      await deletePost(postId, postAuthor).expect(200);

      for (const user of [commenter, postAuthor]) {
        const res = await http()
          .delete(`/comments/${ids.a}`)
          .set('Cookie', user.cookie)
          .send({})
          .expect(404);
        expect(res.body.message).toBe('Comment not found');
      }
    });

    it('nothing can be added to it', async () => {
      const { postAuthor, commenter, postId, ids } = await threadedPost();
      await deletePost(postId, postAuthor).expect(200);

      await http()
        .post(`/posts/${postId}/comments`)
        .set('Cookie', commenter.cookie)
        .send({ body: 'too late', parentCommentId: ids.a })
        .expect(404);
    });
  });

  describe('an admin deleting someone else\'s post', () => {
    it('cascades too, and the audit entry and notification are unchanged', async () => {
      const { postAuthor, postId, ids } = await threadedPost();
      const admin = await data.createUser('admin');

      await deletePost(postId, admin, { reason: 'spam' }).expect(200);

      for (const id of Object.values(ids)) {
        expect((await commentRow(id))!.deletedAt).not.toBeNull();
      }
      const audit = await data.models.auditLog
        .find({ targetUserId: postAuthor.id, action: 'delete_post' })
        .lean();
      expect(audit).toHaveLength(1);
      expect(audit[0].reason).toBe('spam');
      const notes = await data.models.notification
        .find({ userId: postAuthor.id })
        .lean();
      expect(notes.map((n) => n.message)).toEqual([
        'An administrator deleted your post. Reason: spam',
      ]);
    });

    it('records nothing about the comments: the cascade is not itself an audit event', async () => {
      const { postAuthor, commenter, postId } = await threadedPost();
      const admin = await data.createUser('admin');

      await deletePost(postId, admin).expect(200);

      expect(
        await data.models.auditLog.countDocuments({
          targetUserId: commenter.id,
        }),
      ).toBe(0);
      expect(
        await data.models.notification.countDocuments({ userId: commenter.id }),
      ).toBe(0);
      expect(postAuthor.id).not.toBe(commenter.id);
    });
  });

  describe('when the post\'s delete does not go through', () => {
    // The comments may only be touched once the post's own delete has been
    // saved. If it loses to a concurrent edit (optimistic concurrency), the
    // post is still live, so its comments must be too.
    it('leaves the comments alone when the post delete loses to a concurrent edit', async () => {
      const { postId, ids } = await threadedPost();
      const { PostsService } = await import('../src/posts/posts.service.js');
      const service = app.get(PostsService, { strict: false });
      const fetched = await service.findRawById(postId);
      // Someone else changes the post after it was fetched: its version moves
      // on, so saving the delete from the stale copy is a conflict.
      await data.models.post.updateOne(
        { _id: postId },
        { $inc: { __v: 1 } },
        { timestamps: false },
      );

      await expect(service.remove(fetched!)).rejects.toThrow(
        'changed by someone else',
      );

      expect((await postRow(postId))!.deletedAt).toBeNull();
      for (const id of Object.values(ids)) {
        expect((await commentRow(id))!.deletedAt).toBeNull();
      }
    });
  });

  describe('when the comment cascade itself fails', () => {
    it('still reports the delete as done, logs it, and the comments stay hidden', async () => {
      const { postAuthor, postId, ids } = await threadedPost();
      const { CommentsService } = await import('../src/comments/comments.service.js');
      const comments = app.get(CommentsService, { strict: false });
      const cascade = jest
        .spyOn(comments, 'removeAllForPost')
        .mockRejectedValueOnce(new Error('simulated: cascade failed') as never);
      const log = jest.spyOn(Logger.prototype, 'error');

      try {
        // The post really was deleted, so the client is told so.
        await deletePost(postId, postAuthor).expect(200);
        expect(log).toHaveBeenCalledTimes(1);
        expect(String(log.mock.calls[0][0])).toContain(
          'could not be soft-deleted',
        );
      } finally {
        cascade.mockRestore();
        log.mockRestore();
      }

      expect((await postRow(postId))!.deletedAt).not.toBeNull();
      // Nothing is exposed: comments are only read through their post.
      await http().get(`/posts/${postId}`).expect(404);
      await http().get(`/posts/${postId}/comments`).expect(404);
      // They are simply left live in the collection.
      for (const id of Object.values(ids)) {
        expect((await commentRow(id))!.deletedAt).toBeNull();
      }
    });
  });
});
