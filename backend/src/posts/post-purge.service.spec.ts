import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { CronJob } from 'cron';
import {
  POST_PURGE_JOB,
  PostPurgeService,
  PURGE_BATCH_SIZE,
} from './post-purge.service';

// Only the Mongoose models, ConfigService and SchedulerRegistry are faked. The
// service's own logic (cutoff, batching, order of deletes, error handling) is
// the real code, so each case scripts what the database "returned" and asserts
// what the service then asked it to do.
//
// What these cannot show: that the filters really match the right rows in
// MongoDB, or that every row is gone afterwards. test/posts-purge.e2e-spec.ts
// covers that. Whether cron fires on time is the library's job and is not
// tested anywhere.

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type Call = { name: string; filter: unknown };

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-04T12:00:00.000Z');

let idCounter = 0;
const ids = (count: number) =>
  Array.from({ length: count }, () => ({ _id: `id-${++idCounter}` }));

type Config = {
  POST_PURGE_ENABLED: boolean;
  POST_PURGE_RETENTION_DAYS: number;
  POST_PURGE_CRON: string;
};

type Script = {
  // What Post.find returns on each pass; after the list runs out: nothing.
  postBatches?: { _id: string }[][];
  comments?: { _id: string }[];
  // Overrides the deletedCount that deleteMany reports for posts.
  postsDeleted?: (filterIds: unknown[]) => number;
  postFindError?: Error;
  config?: Partial<Config>;
};

function setup(script: Script = {}) {
  const calls: Call[] = [];
  const record = (name: string, filter: unknown) =>
    calls.push({ name, filter });
  const batches = [...(script.postBatches ?? [])];

  const post = {
    find: jest.fn((filter: unknown) => {
      record('post.find', filter);
      return {
        select: () => ({
          limit: (n: number) => ({
            lean: async () => {
              if (script.postFindError) throw script.postFindError;
              expect(n).toBe(PURGE_BATCH_SIZE);
              return batches.shift() ?? [];
            },
          }),
        }),
      };
    }),
    deleteMany: jest.fn<AsyncFn>(async (filter: unknown) => {
      record('post.deleteMany', filter);
      const list = (filter as { _id: { $in: unknown[] } })._id.$in;
      return { deletedCount: (script.postsDeleted ?? ((l) => l.length))(list) };
    }),
  };

  const comment = {
    find: jest.fn((filter: unknown) => {
      record('comment.find', filter);
      return {
        select: () => ({ lean: async () => script.comments ?? [] }),
      };
    }),
    deleteMany: jest.fn<AsyncFn>(async (filter: unknown) => {
      record('comment.deleteMany', filter);
      return { deletedCount: (script.comments ?? []).length };
    }),
  };

  const reaction = {
    deleteMany: jest.fn<AsyncFn>(async (filter: unknown) => {
      const targetType = (filter as { targetType: string }).targetType;
      record(`reaction.deleteMany:${targetType}`, filter);
      return { deletedCount: 2 };
    }),
  };

  const config: Config = {
    POST_PURGE_ENABLED: true,
    POST_PURGE_RETENTION_DAYS: 7,
    POST_PURGE_CRON: '0 3 * * *',
    ...script.config,
  };
  const configService = {
    getOrThrow: (key: keyof Config) => config[key],
  };
  const registry = { addCronJob: jest.fn() };

  const service = new PostPurgeService(
    post as never,
    comment as never,
    reaction as never,
    configService as never,
    registry as never,
  );
  return { service, calls, post, comment, reaction, registry };
}

const names = (calls: Call[]) => calls.map((c) => c.name);

describe('PostPurgeService.purgeExpiredPosts', () => {
  it('selects posts deleted at or before now minus the retention days', async () => {
    const { service, calls } = setup();

    await service.purgeExpiredPosts(NOW);

    const find = calls.find((c) => c.name === 'post.find');
    expect(find?.filter).toEqual({
      deletedAt: { $lte: new Date(NOW.getTime() - 7 * DAY_MS) },
    });
  });

  it('moves the cutoff when the configured retention changes', async () => {
    const { service, calls } = setup({
      config: { POST_PURGE_RETENTION_DAYS: 30 },
    });

    await service.purgeExpiredPosts(NOW);

    const find = calls.find((c) => c.name === 'post.find');
    expect(find?.filter).toEqual({
      deletedAt: { $lte: new Date(NOW.getTime() - 30 * DAY_MS) },
    });
  });

  it('returns zeros and deletes nothing when no post has expired', async () => {
    const { service, calls } = setup({ postBatches: [[]] });

    const result = await service.purgeExpiredPosts(NOW);

    expect(result).toEqual({ posts: 0, comments: 0, reactions: 0 });
    expect(names(calls)).toEqual(['post.find']);
  });

  it('deletes reactions, then comments, then posts', async () => {
    const posts = ids(2);
    const comments = ids(3);
    const { service, calls } = setup({ postBatches: [posts], comments });

    await service.purgeExpiredPosts(NOW);

    expect(names(calls)).toEqual([
      'post.find',
      'comment.find',
      'reaction.deleteMany:post',
      'reaction.deleteMany:comment',
      'comment.deleteMany',
      'post.deleteMany',
    ]);
  });

  it('deletes every comment under the posts, selected by postId', async () => {
    const posts = ids(2);
    const { service, calls } = setup({
      postBatches: [posts],
      comments: ids(1),
    });

    await service.purgeExpiredPosts(NOW);

    const postIds = posts.map((p) => p._id);
    const find = calls.find((c) => c.name === 'comment.find');
    const del = calls.find((c) => c.name === 'comment.deleteMany');
    expect(find?.filter).toEqual({ postId: { $in: postIds } });
    expect(del?.filter).toEqual({ postId: { $in: postIds } });
  });

  it('deletes reactions by targetType and targetId', async () => {
    const posts = ids(2);
    const comments = ids(3);
    const { service, calls } = setup({ postBatches: [posts], comments });

    await service.purgeExpiredPosts(NOW);

    const onPosts = calls.find((c) => c.name === 'reaction.deleteMany:post');
    const onComments = calls.find(
      (c) => c.name === 'reaction.deleteMany:comment',
    );
    expect(onPosts?.filter).toEqual({
      targetType: 'post',
      targetId: { $in: posts.map((p) => p._id) },
    });
    expect(onComments?.filter).toEqual({
      targetType: 'comment',
      targetId: { $in: comments.map((c) => c._id) },
    });
  });

  it('skips the comment-reaction delete when the posts have no comments', async () => {
    const { service, calls } = setup({ postBatches: [ids(2)], comments: [] });

    const result = await service.purgeExpiredPosts(NOW);

    expect(names(calls)).not.toContain('reaction.deleteMany:comment');
    // Only the post-reaction delete ran (2 per the stub).
    expect(result.reactions).toBe(2);
  });

  it('sums posts, comments and reactions into the result', async () => {
    const { service } = setup({
      postBatches: [ids(2)],
      comments: ids(3),
    });

    const result = await service.purgeExpiredPosts(NOW);

    expect(result).toEqual({ posts: 2, comments: 3, reactions: 4 });
  });

  it('runs several passes while batches come back full, and adds up the totals', async () => {
    const { service, post } = setup({
      postBatches: [
        ids(PURGE_BATCH_SIZE),
        ids(PURGE_BATCH_SIZE),
        ids(PURGE_BATCH_SIZE / 2),
      ],
    });

    const result = await service.purgeExpiredPosts(NOW);

    expect(post.find).toHaveBeenCalledTimes(3);
    expect(post.deleteMany).toHaveBeenCalledTimes(3);
    expect(result.posts).toBe(PURGE_BATCH_SIZE * 2 + PURGE_BATCH_SIZE / 2);
  });

  it('stops after a short batch without asking again', async () => {
    const { service, post } = setup({
      // The second batch must never be read.
      postBatches: [ids(PURGE_BATCH_SIZE - 1), ids(5)],
    });

    const result = await service.purgeExpiredPosts(NOW);

    expect(post.find).toHaveBeenCalledTimes(1);
    expect(result.posts).toBe(PURGE_BATCH_SIZE - 1);
  });

  it('asks once more after an exactly full batch, and stops on the empty one', async () => {
    const { service, post } = setup({ postBatches: [ids(PURGE_BATCH_SIZE)] });

    const result = await service.purgeExpiredPosts(NOW);

    expect(post.find).toHaveBeenCalledTimes(2);
    expect(result.posts).toBe(PURGE_BATCH_SIZE);
  });

  it('stops when a full batch deletes zero posts instead of looping forever', async () => {
    const { service, post } = setup({
      // The same full batch would be returned on every pass if the loop did
      // not stop; three are queued so a runaway loop would show as 3 calls.
      postBatches: [
        ids(PURGE_BATCH_SIZE),
        ids(PURGE_BATCH_SIZE),
        ids(PURGE_BATCH_SIZE),
      ],
      postsDeleted: () => 0,
    });

    const result = await service.purgeExpiredPosts(NOW);

    expect(post.find).toHaveBeenCalledTimes(1);
    expect(result.posts).toBe(0);
  });
});

describe('PostPurgeService.handleCron', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('swallows an error and logs it, so the timer never sees a rejection', async () => {
    const { service } = setup({ postFindError: new Error('db down') });

    await expect(service.handleCron()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('Post purge failed');
    expect(String(errorSpy.mock.calls[0][1])).toContain('db down');
  });

  it('logs the counts when something was purged', async () => {
    const { service } = setup({ postBatches: [ids(2)], comments: ids(3) });

    await service.handleCron();

    expect(logSpy).toHaveBeenCalledWith(
      'Purged 2 posts, 3 comments, 4 reactions',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log a purge line when nothing was purged', async () => {
    const { service } = setup({ postBatches: [[]] });

    await service.handleCron();

    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('PostPurgeService.onApplicationBootstrap', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers and starts the job with the configured expression when enabled', () => {
    const { service, registry } = setup({
      config: { POST_PURGE_CRON: '*/10 * * * * *' },
    });

    service.onApplicationBootstrap();

    expect(registry.addCronJob).toHaveBeenCalledTimes(1);
    const [name, job] = registry.addCronJob.mock.calls[0] as [string, CronJob];
    try {
      expect(name).toBe(POST_PURGE_JOB);
      expect(job.cronTime.source).toBe('*/10 * * * * *');
      expect(job.isActive).toBe(true);
    } finally {
      // The real timer must not outlive the test.
      job.stop();
    }
  });

  it('registers nothing when disabled', () => {
    const { service, registry } = setup({
      config: { POST_PURGE_ENABLED: false },
    });

    service.onApplicationBootstrap();

    expect(registry.addCronJob).not.toHaveBeenCalled();
  });
});
