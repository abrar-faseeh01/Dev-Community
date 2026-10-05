import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Types } from 'mongoose';
import {
  POST_PURGE_JOB,
  PostPurgeService,
  PURGE_BATCH_SIZE,
} from '../src/posts/post-purge.service';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// Real-database checks for the post purge job. The unit spec proves the
// service sends the right filters in the right order; what only a real
// database can show is here: that those filters really match the right rows,
// that the comments and reactions under an expired post are really gone, and
// that everything else is really untouched.
//
// The job is called directly. The schedule itself must be off in this app, and
// the first test below pins that.
const DAY_MS = 24 * 60 * 60 * 1000;

describeE2e('post purge', () => {
  let app: INestApplication;
  let data: E2eData;
  let purge: PostPurgeService;
  let retentionDays: number;
  let author: E2eUser;
  let reactor: E2eUser;

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
  const oid = (id: unknown) => new Types.ObjectId(String(id));

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();

    purge = app.get(PostPurgeService, { strict: false });
    retentionDays = app
      .get(ConfigService, { strict: false })
      .getOrThrow<number>('POST_PURGE_RETENTION_DAYS');

    // purgeExpiredPosts() takes every expired post in the database, not just
    // this test's. If real expired posts are waiting there, running it would
    // hard-delete them, so refuse instead.
    const foreign = await data.models.post.countDocuments({
      deletedAt: { $lte: daysAgo(retentionDays) },
    });
    if (foreign > 0) {
      throw new Error(
        `[e2e] ${foreign} expired soft-deleted post(s) already exist in this database. ` +
          'Running the purge would delete them. Let the job purge them first, or remove them by hand.',
      );
    }

    author = await data.createUser();
    reactor = await data.createUser();
  });

  afterAll(async () => {
    try {
      // Removes by tracked ids, so it is fine that the purge already deleted
      // some of what was tracked.
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  async function insertPost(deletedAt: Date | null, title: string) {
    const post = await data.models.post.create({
      authorId: oid(author.id),
      title,
      body: 'throwaway post for the purge e2e',
      deletedAt,
    });
    data.trackPost(String(post._id));
    return oid(post._id);
  }

  async function insertComment(postId: Types.ObjectId, deletedAt: Date | null) {
    const comment = await data.models.comment.create({
      postId,
      authorId: oid(author.id),
      body: 'throwaway comment for the purge e2e',
      deletedAt,
    });
    data.trackComment(String(comment._id));
    return oid(comment._id);
  }

  async function insertReaction(
    userId: string,
    targetType: 'post' | 'comment',
    targetId: Types.ObjectId,
  ) {
    await data.models.reaction.create({
      userId: oid(userId),
      targetType,
      targetId,
      type: 'like',
    });
  }

  const postExists = (id: Types.ObjectId) =>
    data.models.post.exists({ _id: id }).then(Boolean);
  const commentExists = (id: Types.ObjectId) =>
    data.models.comment.exists({ _id: id }).then(Boolean);
  const reactionsOn = (
    targetType: 'post' | 'comment',
    targetId: Types.ObjectId,
  ) => data.models.reaction.countDocuments({ targetType, targetId });

  it('does not schedule the job in the e2e app', () => {
    const registry = app.get(SchedulerRegistry, { strict: false });

    expect(registry.getCronJobs().has(POST_PURGE_JOB)).toBe(false);
  });

  describe('purging expired posts', () => {
    // One expired post (with all three comment shapes), one that is not old
    // enough yet, one live, and a live post with an old individually-deleted
    // comment.
    const rows = {} as {
      expired: Types.ObjectId;
      expiredCascaded: Types.ObjectId;
      expiredEarlier: Types.ObjectId;
      expiredLive: Types.ObjectId;
      recent: Types.ObjectId;
      recentComment: Types.ObjectId;
      live: Types.ObjectId;
      liveComment: Types.ObjectId;
      keptPost: Types.ObjectId;
      keptOldComment: Types.ObjectId;
    };
    let first: Awaited<ReturnType<PostPurgeService['purgeExpiredPosts']>>;

    beforeAll(async () => {
      const expiredAt = daysAgo(retentionDays + 1);
      rows.expired = await insertPost(expiredAt, 'e2e expired');
      rows.expiredCascaded = await insertComment(rows.expired, expiredAt);
      rows.expiredEarlier = await insertComment(
        rows.expired,
        new Date(expiredAt.getTime() - 2 * DAY_MS),
      );
      rows.expiredLive = await insertComment(rows.expired, null);
      await insertReaction(reactor.id, 'post', rows.expired);
      await insertReaction(reactor.id, 'comment', rows.expiredCascaded);
      await insertReaction(author.id, 'comment', rows.expiredLive);

      const recentAt = daysAgo(retentionDays - 1);
      rows.recent = await insertPost(recentAt, 'e2e deleted recently');
      rows.recentComment = await insertComment(rows.recent, recentAt);
      await insertReaction(reactor.id, 'post', rows.recent);
      await insertReaction(reactor.id, 'comment', rows.recentComment);

      rows.live = await insertPost(null, 'e2e live');
      rows.liveComment = await insertComment(rows.live, null);
      await insertReaction(reactor.id, 'post', rows.live);
      await insertReaction(reactor.id, 'comment', rows.liveComment);

      // Known limitation: a comment deleted on its own, under a post that is
      // still live, is never purged. This documents it.
      rows.keptPost = await insertPost(null, 'e2e live, old deleted comment');
      rows.keptOldComment = await insertComment(rows.keptPost, daysAgo(30));

      first = await purge.purgeExpiredPosts();
    });

    it('reports exactly what it removed', () => {
      expect(first).toEqual({
        posts: 1,
        comments: 3,
        // post reaction + two comment reactions
        reactions: 3,
      });
    });

    it('removes the expired post', async () => {
      expect(await postExists(rows.expired)).toBe(false);
    });

    it('removes all three kinds of comment under it', async () => {
      expect(await commentExists(rows.expiredCascaded)).toBe(false);
      expect(await commentExists(rows.expiredEarlier)).toBe(false);
      expect(await commentExists(rows.expiredLive)).toBe(false);
    });

    it('removes the reactions on the post and on its comments', async () => {
      expect(await reactionsOn('post', rows.expired)).toBe(0);
      expect(await reactionsOn('comment', rows.expiredCascaded)).toBe(0);
      expect(await reactionsOn('comment', rows.expiredLive)).toBe(0);
    });

    it('leaves a post deleted less than the retention period ago untouched', async () => {
      expect(await postExists(rows.recent)).toBe(true);
      expect(await commentExists(rows.recentComment)).toBe(true);
      expect(await reactionsOn('post', rows.recent)).toBe(1);
      expect(await reactionsOn('comment', rows.recentComment)).toBe(1);
    });

    it('leaves a live post, its comment and its reactions untouched', async () => {
      expect(await postExists(rows.live)).toBe(true);
      expect(await commentExists(rows.liveComment)).toBe(true);
      expect(await reactionsOn('post', rows.live)).toBe(1);
      expect(await reactionsOn('comment', rows.liveComment)).toBe(1);
    });

    it('does not purge an old individually-deleted comment on a live post', async () => {
      expect(await postExists(rows.keptPost)).toBe(true);
      expect(await commentExists(rows.keptOldComment)).toBe(true);
    });

    it('is a no-op when it runs again', async () => {
      const second = await purge.purgeExpiredPosts();

      expect(second).toEqual({ posts: 0, comments: 0, reactions: 0 });
      expect(await postExists(rows.recent)).toBe(true);
      expect(await postExists(rows.live)).toBe(true);
    });
  });

  describe('more than one batch', () => {
    it('purges every expired post when there are more than a batch of them', async () => {
      const total = PURGE_BATCH_SIZE + 5;
      const expiredAt = daysAgo(retentionDays + 2);
      const postDocs = Array.from({ length: total }, (_, i) => ({
        _id: new Types.ObjectId(),
        authorId: oid(author.id),
        title: `e2e batch ${i}`,
        body: 'throwaway post for the purge e2e',
        deletedAt: expiredAt,
      }));
      await data.models.post.insertMany(postDocs);
      const postIds = postDocs.map((p) => p._id);
      postIds.forEach((id) => data.trackPost(String(id)));
      await data.models.comment.insertMany(
        postIds.map((postId) => ({
          postId,
          authorId: oid(author.id),
          body: 'throwaway comment for the purge e2e',
          deletedAt: null,
        })),
      );
      await data.models.reaction.insertMany(
        postIds.map((targetId) => ({
          userId: oid(reactor.id),
          targetType: 'post',
          targetId,
          type: 'like',
        })),
      );

      const result = await purge.purgeExpiredPosts();

      expect(result).toEqual({
        posts: total,
        comments: total,
        reactions: total,
      });
      expect(
        await data.models.post.countDocuments({ _id: { $in: postIds } }),
      ).toBe(0);
      expect(
        await data.models.comment.countDocuments({ postId: { $in: postIds } }),
      ).toBe(0);
      expect(
        await data.models.reaction.countDocuments({
          targetType: 'post',
          targetId: { $in: postIds },
        }),
      ).toBe(0);
    });
  });
});
