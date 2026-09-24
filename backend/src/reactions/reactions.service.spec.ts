import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { ReactionsService } from './reactions.service';
import type { ReactionTargetType, ReactionType } from './schemas/reaction.schema';

// Only the Mongoose models are faked here. reaction-toggle.ts is the REAL
// module: every case scripts what the database "did" (which operation
// matched) and asserts the whole chain that follows — the exact counter update
// sent to the target and the counts/myReaction handed back. A wrong mapping
// from "what matched" to "which action" therefore fails a test, instead of
// passing because a helper was fed the right input by hand.
//
// What these cannot show: a mock returns whatever the test scripts, so they
// say nothing about real Mongo behaviour (that the {type: opposite} filter
// really only matches the opposite type, that a counter really only moves by $inc, that
// the unique index really rejects). test/reactions.e2e-spec.ts covers that.

// Async by default (mockResolvedValue / mockRejectedValue are only typed for
// functions that return a promise); findOne is the exception, because the
// service calls .select().lean().exec() on what it returns, so it gets a mock
// that returns a plain object.
type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type SyncFn = (...args: unknown[]) => unknown;
const fn = () => jest.fn<AsyncFn>();
const syncFn = () => jest.fn<SyncFn>();

const USER = 'u1';
const TARGET = 't1';

// findOne(...).select(...).lean().exec() resolving to `value`.
function chain(value: unknown) {
  return {
    select: () => ({ lean: () => ({ exec: async () => value }) }),
  };
}

// The update the service must send for a given delta, written out
// independently of the service so a change to it is a visible test change.
// A plain $inc on purpose: increments commute, so racing requests converge on
// the reaction rows in any order, which a clamp at zero on the write would
// not (see ReactionsService.incrementCounters).
function updateFor(likeDelta: number, dislikeDelta: number) {
  return { $inc: { likeCount: likeDelta, dislikeCount: dislikeDelta } };
}

const COUNTER_OPTIONS = {
  timestamps: false,
  returnDocument: 'after',
  projection: { likeCount: 1, dislikeCount: 1 },
};

function setup() {
  const reaction = {
    findOneAndDelete: fn(),
    findOneAndUpdate: fn(),
    create: fn(),
    findOne: syncFn(),
    find: syncFn(),
    countDocuments: fn(),
  };
  const post = { exists: fn(), findOneAndUpdate: fn(), findOne: syncFn() };
  const comment = { exists: fn(), findOneAndUpdate: fn(), findOne: syncFn() };

  // The constructor takes Mongoose models; these stand-ins have only the
  // methods the service calls.
  const service = new ReactionsService(
    reaction as never,
    post as never,
    comment as never,
  );
  return { service, reaction, post, comment };
}

const opposite = (t: ReactionType): ReactionType =>
  t === 'like' ? 'dislike' : 'like';

// The delta a like/dislike request must produce for each action, spelled out
// per case below rather than computed, so this file states the contract.
const REQUESTS: ReactionType[] = ['like', 'dislike'];

describe.each<ReactionTargetType>(['post', 'comment'])(
  'ReactionsService (%s target)',
  (targetType) => {
    let env: ReturnType<typeof setup>;
    let target: {
      exists: jest.Mock<AsyncFn>;
      findOneAndUpdate: jest.Mock<AsyncFn>;
      findOne: jest.Mock<SyncFn>;
    };
    let otherTarget: { findOneAndUpdate: jest.Mock<AsyncFn> };

    const toggle = (type: ReactionType) =>
      targetType === 'post'
        ? env.service.togglePost(USER, TARGET, type)
        : env.service.toggleComment(USER, TARGET, type);

    beforeEach(() => {
      env = setup();
      target = targetType === 'post' ? env.post : env.comment;
      otherTarget = targetType === 'post' ? env.comment : env.post;
      target.exists.mockResolvedValue({ _id: TARGET });
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    // The counter update as it was actually sent: [filter, update, options].
    const counterCall = () => {
      expect(target.findOneAndUpdate).toHaveBeenCalledTimes(1);
      return target.findOneAndUpdate.mock.calls[0];
    };

    describe.each(REQUESTS)('requesting %s', (type) => {
      // like: [likeDelta, dislikeDelta]; dislike is the mirror image.
      const own = (n: number): [number, number] =>
        type === 'like' ? [n, 0] : [0, n];
      const both = (): [number, number] =>
        type === 'like' ? [1, -1] : [-1, 1];

      it('creates when there is no row: insert, +1 on its own counter', async () => {
        env.reaction.findOneAndDelete.mockResolvedValue(null);
        env.reaction.findOneAndUpdate.mockResolvedValue(null);
        env.reaction.create.mockResolvedValue({});
        target.findOneAndUpdate.mockResolvedValue({
          likeCount: type === 'like' ? 1 : 0,
          dislikeCount: type === 'dislike' ? 1 : 0,
        });

        const result = await toggle(type);

        expect(env.reaction.create).toHaveBeenCalledWith({
          userId: USER,
          targetType,
          targetId: TARGET,
          type,
        });
        const [filter, update, options] = counterCall();
        expect(filter).toEqual({ _id: TARGET, deletedAt: null });
        expect(update).toEqual(updateFor(...own(1)));
        expect(options).toEqual(COUNTER_OPTIONS);
        expect(result).toEqual({
          likeCount: type === 'like' ? 1 : 0,
          dislikeCount: type === 'dislike' ? 1 : 0,
          myReaction: type,
        });
      });

      it('removes when the row already has this type: delete, -1, myReaction null', async () => {
        env.reaction.findOneAndDelete.mockResolvedValue({ type });
        target.findOneAndUpdate.mockResolvedValue({
          likeCount: 2,
          dislikeCount: 5,
        });

        const result = await toggle(type);

        expect(env.reaction.findOneAndDelete).toHaveBeenCalledWith({
          userId: USER,
          targetType,
          targetId: TARGET,
          type,
        });
        // A delete hit ends the write: no switch attempt, no insert.
        expect(env.reaction.findOneAndUpdate).not.toHaveBeenCalled();
        expect(env.reaction.create).not.toHaveBeenCalled();
        expect(counterCall()[1]).toEqual(updateFor(...own(-1)));
        expect(result).toEqual({
          likeCount: 2,
          dislikeCount: 5,
          myReaction: null,
        });
      });

      it('switches when the row has the opposite type: update in place, +1 own and -1 other', async () => {
        env.reaction.findOneAndDelete.mockResolvedValue(null);
        env.reaction.findOneAndUpdate.mockResolvedValue({
          type: opposite(type),
        });
        target.findOneAndUpdate.mockResolvedValue({
          likeCount: 4,
          dislikeCount: 1,
        });

        const result = await toggle(type);

        // The switch only matches the OPPOSITE type, and sets the requested one.
        expect(env.reaction.findOneAndUpdate).toHaveBeenCalledWith(
          {
            userId: USER,
            targetType,
            targetId: TARGET,
            type: opposite(type),
          },
          { $set: { type } },
        );
        expect(env.reaction.create).not.toHaveBeenCalled();
        expect(counterCall()[1]).toEqual(updateFor(...both()));
        expect(result).toEqual({
          likeCount: 4,
          dislikeCount: 1,
          myReaction: type,
        });
      });

      it('after a lost race (E11000) changes no counter and reports the row that won', async () => {
        env.reaction.findOneAndDelete.mockResolvedValue(null);
        env.reaction.findOneAndUpdate.mockResolvedValue(null);
        env.reaction.create.mockRejectedValue(
          Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
        );
        // The winner may hold either type; here, the opposite of what this
        // request asked for.
        env.reaction.findOne.mockReturnValue(chain({ type: opposite(type) }));
        target.findOne.mockReturnValue(chain({ likeCount: 7, dislikeCount: 3 }));

        const result = await toggle(type);

        expect(target.findOneAndUpdate).not.toHaveBeenCalled();
        expect(result).toEqual({
          likeCount: 7,
          dislikeCount: 3,
          myReaction: opposite(type),
        });
      });
    });

    it('reports myReaction null when the racing row is already gone again', async () => {
      env.reaction.findOneAndDelete.mockResolvedValue(null);
      env.reaction.findOneAndUpdate.mockResolvedValue(null);
      env.reaction.create.mockRejectedValue({ code: 11000 });
      env.reaction.findOne.mockReturnValue(chain(null));
      target.findOne.mockReturnValue(chain({ likeCount: 0, dislikeCount: 0 }));

      await expect(toggle('like')).resolves.toEqual({
        likeCount: 0,
        dislikeCount: 0,
        myReaction: null,
      });
    });

    it('rethrows an insert error that is not a duplicate key, touching no counter', async () => {
      const boom = new Error('connection lost');
      env.reaction.findOneAndDelete.mockResolvedValue(null);
      env.reaction.findOneAndUpdate.mockResolvedValue(null);
      env.reaction.create.mockRejectedValue(boom);

      await expect(toggle('like')).rejects.toBe(boom);
      expect(target.findOneAndUpdate).not.toHaveBeenCalled();
      expect(env.reaction.findOne).not.toHaveBeenCalled();
    });

    it('only ever writes to the counters of its own target type', async () => {
      env.reaction.findOneAndDelete.mockResolvedValue({ type: 'like' });
      target.findOneAndUpdate.mockResolvedValue({ likeCount: 0, dislikeCount: 0 });

      await toggle('like');

      expect(target.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(otherTarget.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('treats counters missing from the stored target as 0 in the response', async () => {
      // A comment written before the counters existed, returned without them.
      env.reaction.findOneAndDelete.mockResolvedValue(null);
      env.reaction.findOneAndUpdate.mockResolvedValue(null);
      env.reaction.create.mockResolvedValue({});
      target.findOneAndUpdate.mockResolvedValue({});

      await expect(toggle('like')).resolves.toEqual({
        likeCount: 0,
        dislikeCount: 0,
        myReaction: 'like',
      });
    });

    it('shows a counter that has drifted below zero as 0, without writing a floor', async () => {
      // A plain $inc can leave a counter negative if it had already drifted;
      // it is repaired by the recount, and never shown negative.
      env.reaction.findOneAndDelete.mockResolvedValue({ type: 'like' });
      target.findOneAndUpdate.mockResolvedValue({
        likeCount: -1,
        dislikeCount: 3,
      });

      const result = await toggle('like');

      expect(result).toEqual({
        likeCount: 0,
        dislikeCount: 3,
        myReaction: null,
      });
      // The update itself is the bare decrement — no floor on the write.
      expect(counterCall()[1]).toEqual({
        $inc: { likeCount: -1, dislikeCount: 0 },
      });
    });

    describe('entry check', () => {
      it('404s before writing anything when the target is missing or deleted', async () => {
        target.exists.mockResolvedValue(null);

        await expect(toggle('like')).rejects.toThrow(NotFoundException);
        expect(target.exists).toHaveBeenCalledWith({
          _id: TARGET,
          deletedAt: null,
        });
        expect(env.reaction.findOneAndDelete).not.toHaveBeenCalled();
        expect(env.reaction.create).not.toHaveBeenCalled();
        expect(target.findOneAndUpdate).not.toHaveBeenCalled();
      });
    });

    describe('when the counter update cannot complete', () => {
      beforeEach(() => {
        // The row is written (a create); it is the counter step that breaks.
        env.reaction.findOneAndDelete.mockResolvedValue(null);
        env.reaction.findOneAndUpdate.mockResolvedValue(null);
        env.reaction.create.mockResolvedValue({});
      });

      it('404s when the target was deleted after the entry check (update matched nothing)', async () => {
        target.findOneAndUpdate.mockResolvedValue(null);

        await expect(toggle('like')).rejects.toThrow(NotFoundException);
      });

      it('recounts both counters from the reaction rows and answers with those', async () => {
        target.findOneAndUpdate
          .mockRejectedValueOnce(new Error('write failed'))
          .mockResolvedValueOnce({ likeCount: 6, dislikeCount: 2 });
        env.reaction.countDocuments
          .mockResolvedValueOnce(6)
          .mockResolvedValueOnce(2);

        const result = await toggle('like');

        expect(env.reaction.countDocuments).toHaveBeenCalledWith({
          targetType,
          targetId: TARGET,
          type: 'like',
        });
        expect(env.reaction.countDocuments).toHaveBeenCalledWith({
          targetType,
          targetId: TARGET,
          type: 'dislike',
        });
        // Second call is the repair: set, not increment.
        expect(target.findOneAndUpdate.mock.calls[1][1]).toEqual({
          $set: { likeCount: 6, dislikeCount: 2 },
        });
        expect(result).toEqual({
          likeCount: 6,
          dislikeCount: 2,
          myReaction: 'like',
        });
      });

      it('gives a 500 when the recount fails too', async () => {
        target.findOneAndUpdate.mockRejectedValue(new Error('write failed'));
        env.reaction.countDocuments.mockRejectedValue(new Error('count failed'));

        await expect(toggle('like')).rejects.toThrow(
          InternalServerErrorException,
        );
      });
    });
  },
);

describe('ReactionsService.findMineFor', () => {
  it('answers a whole page with one query and maps targetId to type', async () => {
    const { service, reaction } = setup();
    // Only two of the three targets have a reaction from this user.
    reaction.find.mockReturnValue(
      chain([
        { targetId: 'a', type: 'like' },
        { targetId: 'c', type: 'dislike' },
      ]),
    );

    const mine = await service.findMineFor(USER, 'post', ['a', 'b', 'c']);

    expect(reaction.find).toHaveBeenCalledTimes(1);
    expect(reaction.find).toHaveBeenCalledWith({
      userId: USER,
      targetType: 'post',
      targetId: { $in: ['a', 'b', 'c'] },
    });
    expect(mine.get('a')).toBe('like');
    expect(mine.get('c')).toBe('dislike');
    // No key means "no reaction".
    expect(mine.has('b')).toBe(false);
  });

  it('stringifies ObjectId target ids so they match the ids the routes hold', async () => {
    const { service, reaction } = setup();
    const objectIdLike = { toString: () => 'abc123' };
    reaction.find.mockReturnValue(
      chain([{ targetId: objectIdLike, type: 'like' }]),
    );

    const mine = await service.findMineFor(USER, 'comment', ['abc123']);

    expect(mine.get('abc123')).toBe('like');
  });

  it('makes no query for an anonymous caller', async () => {
    const { service, reaction } = setup();

    const mine = await service.findMineFor(null, 'post', ['a', 'b']);

    expect(mine.size).toBe(0);
    expect(reaction.find).not.toHaveBeenCalled();
  });

  it('makes no query for an empty page', async () => {
    const { service, reaction } = setup();

    const mine = await service.findMineFor(USER, 'post', []);

    expect(mine.size).toBe(0);
    expect(reaction.find).not.toHaveBeenCalled();
  });
});
