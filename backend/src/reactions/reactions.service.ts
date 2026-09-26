import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comment } from '../comments/schemas/comment.schema';
import { Post } from '../posts/schemas/post.schema';
import { MAX_REACTORS_LISTED } from './reaction.constants';
import {
  toReactor,
  type PopulatedReaction,
  type Reactor,
} from './reactor-row';
import {
  counterDelta,
  displayCount,
  oppositeType,
  resultingReaction,
  type CounterDelta,
  type ReactionAction,
} from './reaction-toggle';
import {
  Reaction,
  type ReactionTargetType,
  type ReactionType,
} from './schemas/reaction.schema';

// What every toggle returns: the target's counters after the change, and the
// caller's own reaction to it (null when they no longer have one).
export type ReactionResult = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
};

// What the reactor-list routes return: the people (newest reaction first,
// capped) and the target's true totals.
export type ReactorList = {
  items: Reactor[];
  likeCount: number;
  dislikeCount: number;
};

type Counts = { likeCount: number; dislikeCount: number };

// The only two things the counter writes need to know about a Post or a
// Comment. Both models have exactly these fields, so one code path serves
// either (see counterModel).
type Counted = Counts & { deletedAt: Date | null };

// What writing the reaction row came to: an action the counters must follow,
// or a lost race (see writeReactionRow) where somebody else's request already
// did the writing and there is nothing left for this one to add.
type RowOutcome =
  | { kind: 'acted'; action: ReactionAction }
  | { kind: 'lost-race'; current: ReactionType | null };

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);

  // Post and Comment are injected directly, the same as CommentsService
  // injects Post: the target check and the counter writes are single queries,
  // and going through PostsService/CommentsService would make those modules
  // and this one depend on each other.
  constructor(
    @InjectModel(Reaction.name) private reactionModel: Model<Reaction>,
    @InjectModel(Post.name) private postModel: Model<Post>,
    @InjectModel(Comment.name) private commentModel: Model<Comment>,
  ) {}

  // The two entry points, one per target type. Each does the part that is
  // specific to its target — is it there, and not deleted? — and then hands
  // over to the toggle they share. The check runs first so a reaction row is
  // never written for a target that does not exist.
  async togglePost(
    userId: string,
    postId: string,
    type: ReactionType,
  ): Promise<ReactionResult> {
    if (!(await this.postModel.exists({ _id: postId, deletedAt: null }))) {
      throw new NotFoundException('Post not found');
    }
    return this.toggle(userId, 'post', postId, type);
  }

  async toggleComment(
    userId: string,
    commentId: string,
    type: ReactionType,
  ): Promise<ReactionResult> {
    if (
      !(await this.commentModel.exists({ _id: commentId, deletedAt: null }))
    ) {
      throw new NotFoundException('Comment not found');
    }
    return this.toggle(userId, 'comment', commentId, type);
  }

  // "Who reacted", one entry point per target type like the toggles above.
  // Public reads, so nothing here depends on who is asking.
  listPostReactors(postId: string, type?: ReactionType): Promise<ReactorList> {
    return this.listReactors('post', postId, type);
  }

  listCommentReactors(
    commentId: string,
    type?: ReactionType,
  ): Promise<ReactorList> {
    return this.listReactors('comment', commentId, type);
  }

  // The target is read first, for two reasons in one query: a missing or
  // soft-deleted target is a 404 (the same rule the toggle applies), and its
  // counters are the totals returned alongside the list, so they match the
  // numbers next to the buttons. Then the people: newest reaction first (ties
  // broken by _id so the order is stable), capped at MAX_REACTORS_LISTED, each
  // user narrowed to name and headline by the populate. A user who has been
  // deleted populates to null and comes out as the "Deleted user" placeholder.
  private async listReactors(
    targetType: ReactionTargetType,
    targetId: string,
    type?: ReactionType,
  ): Promise<ReactorList> {
    const counts = await this.readCounts(targetType, targetId);

    const rows = (await this.reactionModel
      .find({ targetType, targetId, ...(type ? { type } : {}) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_REACTORS_LISTED)
      .populate('userId', 'fullName headline')
      .lean()
      .exec()) as unknown as PopulatedReaction[];

    return { items: rows.map(toReactor), ...counts };
  }

  // The caller's own reactions to a batch of targets, for the read routes:
  // one query for the whole page or thread, never one per item. Served by the
  // unique index's {userId, targetType, targetId} prefix. Returns a map of
  // targetId -> type containing only the targets they have reacted to, so a
  // missing key means "no reaction". `userId` is null for an anonymous
  // caller — the answer is then empty and no query is made, which is what
  // lets every read route call this without checking who is asking.
  async findMineFor(
    userId: string | null,
    targetType: ReactionTargetType,
    targetIds: string[],
  ): Promise<Map<string, ReactionType>> {
    const mine = new Map<string, ReactionType>();
    if (!userId || targetIds.length === 0) {
      return mine;
    }

    const rows = await this.reactionModel
      .find({ userId, targetType, targetId: { $in: targetIds } })
      .select('targetId type')
      .lean()
      .exec();
    for (const row of rows) {
      mine.set(String(row.targetId), row.type);
    }
    return mine;
  }

  // The shared toggle. Two steps, and the second is decided entirely by the
  // first:
  //   1. write the reaction row and learn which action that was;
  //   2. move the target's counters by that action's delta, and answer with
  //      the counts that update returned.
  // `type` is what the caller asked for. Nothing here re-reads anything to
  // check the result — the action tells the counters what to do, and the
  // counter update tells the response what the counts are.
  private async toggle(
    userId: string,
    targetType: ReactionTargetType,
    targetId: string,
    type: ReactionType,
  ): Promise<ReactionResult> {
    const outcome = await this.writeReactionRow(
      userId,
      targetType,
      targetId,
      type,
    );

    if (outcome.kind === 'lost-race') {
      // Another request created this user's row while this one was working, so
      // its own counter update covers it. Adding a delta here would count the
      // same reaction twice. Only report what is there.
      const counts = await this.readCounts(targetType, targetId);
      return { ...counts, myReaction: outcome.current };
    }

    const counts = await this.applyDelta(
      targetType,
      targetId,
      counterDelta(outcome.action, type),
    );
    return {
      ...counts,
      myReaction: resultingReaction(outcome.action, type),
    };
  }

  // The atomic part. Every step is one database operation on one document, and
  // the answer to "which action was it?" is whichever operation actually
  // matched — there is no read followed by a write, so nothing can change
  // between deciding and doing.
  //
  //   1. delete the row if it already has the requested type   -> removed
  //   2. else change the row if it has the OPPOSITE type        -> switched
  //   3. else insert a row                                      -> created
  //
  // Step 3 can fail with a duplicate-key error (E11000): between steps 1-2
  // finding no row and step 3 inserting one, another request from the same
  // user inserted theirs, and the unique index refused the second. That is not
  // an error for the caller — it is a lost race, handled below.
  private async writeReactionRow(
    userId: string,
    targetType: ReactionTargetType,
    targetId: string,
    type: ReactionType,
  ): Promise<RowOutcome> {
    const mine = { userId, targetType, targetId };

    const removed = await this.reactionModel.findOneAndDelete({
      ...mine,
      type,
    });
    if (removed) {
      return { kind: 'acted', action: 'removed' };
    }

    const switched = await this.reactionModel.findOneAndUpdate(
      { ...mine, type: oppositeType(type) },
      { $set: { type } },
    );
    if (switched) {
      return { kind: 'acted', action: 'switched' };
    }

    try {
      await this.reactionModel.create({ ...mine, type });
      return { kind: 'acted', action: 'created' };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    // The one read on the write path, and only when a race was lost: what row
    // won? It may be the same type as requested or the opposite one, so it is
    // read rather than assumed. null means it was deleted again since.
    const current = await this.reactionModel
      .findOne(mine)
      .select('type')
      .lean()
      .exec();
    return { kind: 'lost-race', current: current?.type ?? null };
  }

  // The Post and Comment models are typed differently but both carry
  // likeCount, dislikeCount and deletedAt, and every write below touches only
  // those. The cast is what lets one method serve both.
  private counterModel(targetType: ReactionTargetType): Model<Counted> {
    return (
      targetType === 'post' ? this.postModel : this.commentModel
    ) as unknown as Model<Counted>;
  }

  // Moves the counters and returns their new values in the same operation.
  //
  // A plain $inc, deliberately NOT a clamped update. The reaction row and its
  // counter are two separate writes (no transactions here), so two racing
  // requests can apply their counter updates in the opposite order to their
  // row writes. Increments commute — +1 then -1 and -1 then +1 both end
  // where they started — so the stored counters always converge to the rows.
  // A clamp at zero does not commute: a -1 that lands first on a counter at 0
  // is swallowed and the +1 that follows leaves the counter one too high.
  // (Sharing recordRemovedComments' clamp was the original plan; the
  // reactions e2e run showed why it does not carry over.) So the floor is
  // applied where the number is shown instead — see displayCount — and a
  // counter that had already drifted below zero is repaired by the recount,
  // not hidden in storage.
  //
  // $inc on a field that is not stored starts from 0, which is what a comment
  // written before the counters existed needs. `timestamps: false` so a
  // reaction never makes a post or comment look edited. `deletedAt: null` in
  // the filter: a target deleted since the entry check matches nothing, which
  // comes back as null.
  private async incrementCounters(
    targetType: ReactionTargetType,
    targetId: string,
    delta: CounterDelta,
  ): Promise<Counts | null> {
    const target = await this.counterModel(targetType).findOneAndUpdate(
      { _id: targetId, deletedAt: null },
      { $inc: { likeCount: delta.likeCount, dislikeCount: delta.dislikeCount } },
      {
        timestamps: false,
        returnDocument: 'after',
        projection: { likeCount: 1, dislikeCount: 1 },
      },
    );
    return target ? toCounts(target) : null;
  }

  // The counter step of a toggle. The reaction row is already written and
  // cannot be undone, so if the counter update throws the counters are
  // repaired from the rows themselves (recountCounters) instead of failing
  // the request. A target that matched nothing was deleted mid-request: the
  // reaction row stays, harmlessly, like the rows of any deleted target.
  private async applyDelta(
    targetType: ReactionTargetType,
    targetId: string,
    delta: CounterDelta,
  ): Promise<Counts> {
    let counts: Counts | null;
    try {
      counts = await this.incrementCounters(targetType, targetId, delta);
    } catch (error) {
      this.logger.error(
        `${targetType} ${targetId}: counter update failed after the reaction was written; recounting instead`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.recountCounters(targetType, targetId);
    }

    if (!counts) {
      throw new NotFoundException(notFoundMessage(targetType));
    }
    return counts;
  }

  // Repair, not the normal path: sets both counters from the reaction rows
  // themselves. Never run on an ordinary toggle.
  private async recountCounters(
    targetType: ReactionTargetType,
    targetId: string,
  ): Promise<Counts> {
    try {
      const [likeCount, dislikeCount] = await Promise.all([
        this.reactionModel.countDocuments({
          targetType,
          targetId,
          type: 'like',
        }),
        this.reactionModel.countDocuments({
          targetType,
          targetId,
          type: 'dislike',
        }),
      ]);
      const target = await this.counterModel(targetType).findOneAndUpdate(
        { _id: targetId, deletedAt: null },
        { $set: { likeCount, dislikeCount } },
        {
          timestamps: false,
          returnDocument: 'after',
          projection: { likeCount: 1, dislikeCount: 1 },
        },
      );
      if (!target) {
        throw new NotFoundException(notFoundMessage(targetType));
      }
      return toCounts(target);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `${targetType} ${targetId}: recount failed; the counters need repair`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'The reaction could not be saved. Please try again.',
      );
    }
  }

  // The current counters, changed by nothing, or a 404 when the target is
  // missing or deleted. For the lost-race answer and the reactor lists.
  private async readCounts(
    targetType: ReactionTargetType,
    targetId: string,
  ): Promise<Counts> {
    const target = await this.counterModel(targetType)
      .findOne({ _id: targetId, deletedAt: null })
      .select('likeCount dislikeCount')
      .lean()
      .exec();
    if (!target) {
      throw new NotFoundException(notFoundMessage(targetType));
    }
    return toCounts(target);
  }
}

// Every count that leaves this service goes through displayCount, so a
// counter that is missing (a comment from before the counters) or negative
// (drifted, awaiting repair) reads as 0.
function toCounts(target: Partial<Counts>): Counts {
  return {
    likeCount: displayCount(target.likeCount),
    dislikeCount: displayCount(target.dislikeCount),
  };
}

function notFoundMessage(targetType: ReactionTargetType): string {
  return targetType === 'post' ? 'Post not found' : 'Comment not found';
}
