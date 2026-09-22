import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { AuditAction } from '../src/audit/schemas/audit-log.schema';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

const DELETED_AUTHOR = { id: null, fullName: 'Deleted user', headline: null };

// A user can be hard-deleted by an admin (DELETE /users/:id), which leaves
// their posts pointing at an account that no longer exists. Every route that
// reads or moderates such a post has to cope with that.
describeE2e('posts whose author was deleted', () => {
  let app: INestApplication;
  let data: E2eData;
  let admin: E2eUser;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();
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

  async function createPost(author: E2eUser, title = 'e2e post') {
    const res = await http()
      .post('/posts')
      .set('Cookie', author.cookie)
      .send({ title, body: 'throwaway post body' })
      .expect(201);
    const id: string = res.body.data.id;
    data.trackPost(id);
    return id;
  }

  // A post by a throwaway author who is then hard-deleted through the real
  // admin route, exactly how a deleted author arises in practice.
  async function orphanedPost() {
    const author = await data.createUser('user');
    const postId = await createPost(author);
    await http()
      .delete(`/users/${author.id}`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(200);
    return { author, postId };
  }

  const auditFor = (targetUserId: string, action: AuditAction) =>
    data.models.auditLog.find({ targetUserId, action }).lean().exec();
  const notificationsFor = (userId: string) =>
    data.models.notification.find({ userId }).lean().exec();

  describe('the author is gone', () => {
    it('the feed lists the post with a placeholder author', async () => {
      const { postId } = await orphanedPost();

      const res = await http().get('/posts?limit=10').expect(200);

      const item = res.body.data.items.find(
        (p: { id: string }) => p.id === postId,
      );
      expect(item).toBeDefined();
      expect(item.author).toEqual(DELETED_AUTHOR);
    });

    it('the detail route returns the post with a placeholder author', async () => {
      const { postId } = await orphanedPost();

      const res = await http().get(`/posts/${postId}`).expect(200);

      expect(res.body.data.id).toBe(postId);
      expect(res.body.data.author).toEqual(DELETED_AUTHOR);
    });

    it('an admin can edit it: audit entry with the fallback name, nobody to notify', async () => {
      const { author, postId } = await orphanedPost();

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Cookie', admin.cookie)
        .send({ title: 'edited by an admin', reason: 'e2e' })
        .expect(200);

      expect(res.body.data.title).toBe('edited by an admin');
      expect(res.body.data.author).toEqual(DELETED_AUTHOR);

      const audit = await auditFor(author.id, 'update_post');
      expect(audit).toHaveLength(1);
      expect(audit[0].targetFullName).toBe('Deleted user');
      expect(audit[0].reason).toBe('e2e');
      expect(await notificationsFor(author.id)).toHaveLength(0);
    });

    it('an admin can delete it: audit entry with the fallback name, nobody to notify', async () => {
      const { author, postId } = await orphanedPost();

      const res = await http()
        .delete(`/posts/${postId}`)
        .set('Cookie', admin.cookie)
        .send({ reason: 'e2e' })
        .expect(200);

      expect(res.body.data.id).toBe(postId);
      expect(res.body.data.deletedAt).toBeTruthy();

      const audit = await auditFor(author.id, 'delete_post');
      expect(audit).toHaveLength(1);
      expect(audit[0].targetFullName).toBe('Deleted user');
      expect(await notificationsFor(author.id)).toHaveLength(0);

      // Soft-deleted: it no longer reads back.
      await http().get(`/posts/${postId}`).expect(404);
    });
  });

  // The behaviour that must not change for a post whose author still exists.
  describe('the author exists (unchanged behaviour)', () => {
    it('the post reads back with the real author', async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);

      const res = await http().get(`/posts/${postId}`).expect(200);

      expect(res.body.data.author).toEqual({
        id: author.id,
        fullName: author.fullName,
      });
    });

    it('an admin editing and deleting it is audit-logged and the author is notified', async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author, 'live author post');

      await http()
        .patch(`/posts/${postId}`)
        .set('Cookie', admin.cookie)
        .send({ title: 'admin edit', reason: 'e2e reason' })
        .expect(200);
      await http()
        .delete(`/posts/${postId}`)
        .set('Cookie', admin.cookie)
        .send({ reason: 'e2e reason' })
        .expect(200);

      const updates = await auditFor(author.id, 'update_post');
      expect(updates).toHaveLength(1);
      expect(updates[0].targetFullName).toBe(author.fullName);
      expect(updates[0].previousState).toEqual({
        postId,
        title: 'live author post',
      });
      expect(updates[0].newState).toEqual({ postId, title: 'admin edit' });
      expect(await auditFor(author.id, 'delete_post')).toHaveLength(1);

      const notes = await notificationsFor(author.id);
      expect(notes.map((n) => n.message).sort()).toEqual([
        'An administrator deleted your post. Reason: e2e reason',
        'An administrator updated your post. Reason: e2e reason',
      ]);
    });

    it('the author editing and deleting their own post leaves no audit entry or notification', async () => {
      const author = await data.createUser('user');
      const postId = await createPost(author);

      await http()
        .patch(`/posts/${postId}`)
        .set('Cookie', author.cookie)
        .send({ title: 'my own edit' })
        .expect(200);
      await http()
        .delete(`/posts/${postId}`)
        .set('Cookie', author.cookie)
        .send({})
        .expect(200);

      expect(await auditFor(author.id, 'update_post')).toHaveLength(0);
      expect(await auditFor(author.id, 'delete_post')).toHaveLength(0);
      expect(await notificationsFor(author.id)).toHaveLength(0);
    });
  });
});
