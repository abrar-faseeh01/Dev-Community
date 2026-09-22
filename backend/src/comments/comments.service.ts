import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '../posts/schemas/post.schema';
import { toCommentRow, type PopulatedComment } from './comment-row';
import {
  buildCommentTree,
  childAncestorIds,
  type CommentNode,
  type CommentRow,
} from './comment-tree';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from './schemas/comment.schema';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  // The Post model is injected directly rather than going through
  // PostsService: the counter writes, the live-post check and (later) the
  // post-author lookup are all single queries on Post, and importing
  // PostsService here would make CommentsModule and PostsModule depend on
  // each other once posts start cascading their deletes to comments.
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<Comment>,
    @InjectModel(Post.name) private postModel: Model<Post>,
  ) {}

  // Order matters here, and each step is its own failure mode:
  //   1. the post must be live — a comment on a missing or soft-deleted post
  //      is a 404, decided before anything is written;
  //   2. if it is a reply, resolve the parent (resolveParent) — the last read
  //      before the insert, so the window in which a concurrent delete could
  //      remove the parent is as short as it can be made;
  //   3. insert the comment;
  //   4. bump Post.commentCount atomically (recordNewComment).
  // authorId comes from the authenticated requester and postId from the URL,
  // never from the body — CreateCommentDto has no such fields, and the global
  // pipe rejects them as unknown properties.
  async create(
    postId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentRow> {
    const post = await this.postModel.exists({ _id: postId, deletedAt: null });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const { parentCommentId, ancestorIds } = await this.resolveParent(
      postId,
      dto.parentCommentId,
    );

    const comment = await this.commentModel.create({
      postId,
      authorId,
      parentCommentId,
      ancestorIds,
      body: dto.body,
    });

    await this.recordNewComment(postId, comment._id as Types.ObjectId);

    // Populated after the insert, the same as PostsService.create: the
    // response carries the author's name and headline, not a bare id. On a
    // document, populate() edits it in place and does not narrow the TS type,
    // hence the cast — the runtime shape is what PopulatedComment describes.
    await comment.populate('authorId', 'fullName headline');
    return toCommentRow(comment as unknown as PopulatedComment);
  }

  // A post's whole comment tree, ready to return.
  //
  // One query fetches every live comment on the post; the hierarchy is then
  // built in memory (buildCommentTree). That is the reason for the
  // {postId, deletedAt, _id} index: the filter is its prefix and the sort is
  // its tail, so the database walks the index in order and never has to sort.
  // There is no query per parent and no recursion in the database, which is
  // what keeps the cost flat however deep or wide the tree is.
  //
  // Only the fields the response needs are loaded — ancestorIds in particular
  // is never read here, since the tree is built from parentCommentId. The
  // author is populated (one batched lookup on users for the whole list, not
  // one per comment); an account that has since been deleted populates to
  // null, which toAuthorSummary turns into the "Deleted user" placeholder.
  //
  // Ordering and orphans are buildCommentTree's job, not this query's: it
  // sorts for itself and drops any comment whose parent is not in the list.
  // There is no pagination — the whole tree comes back.
  async list(postId: string): Promise<CommentNode[]> {
    const post = await this.postModel.exists({ _id: postId, deletedAt: null });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comments = await this.commentModel
      .find({ postId, deletedAt: null })
      .select('postId authorId parentCommentId body createdAt updatedAt')
      .sort({ _id: 1 })
      .populate('authorId', 'fullName headline')
      .lean()
      .exec();

    return buildCommentTree(
      comments.map((comment) =>
        toCommentRow(comment as unknown as PopulatedComment),
      ),
    );
  }

  // The comment a delete request is about, or a 404. Only what the caller
  // needs to decide "may this requester delete it?" and to run the cascade:
  // its post (the cascade is scoped to it) and its author (the permission
  // check). `deletedAt: null` means an already-deleted comment 404s here
  // exactly like a nonexistent one, before authorization even runs.
  //
  // authorId is the raw id, not populated, so it survives the author's
  // account having been deleted.
  async findLiveById(
    id: string,
  ): Promise<{ _id: Types.ObjectId; postId: Types.ObjectId; authorId: Types.ObjectId }> {
    const comment = await this.commentModel
      .findOne({ _id: id, deletedAt: null })
      .select('postId authorId')
      .lean()
      .exec();
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  // The author of the post a comment sits on, for the "post owners may remove
  // comments on their own post" rule. Null if the post is gone: the normal
  // live filter, so a deleted post grants nobody anything (its comments are
  // deleted along with it anyway). The caller only asks when the requester is
  // neither the comment's author nor an admin, so most deletes never run this.
  async findPostAuthorId(postId: Types.ObjectId): Promise<string | null> {
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null })
      .select('authorId')
      .lean()
      .exec();
    return post ? String(post.authorId) : null;
  }

  // Soft-deletes a comment and every reply beneath it, then brings
  // Post.commentCount back in line.
  //
  // The cascade is ONE atomic updateMany, which is what the materialized path
  // is for: a comment is in the subtree if it IS the target or if the target
  // appears in its ancestorIds. There is no "find the descendants, then mark
  // them" — that would leave a window in which a reply created in between
  // survives under a deleted parent.
  //
  // `deletedAt: null` in the filter is what makes it safe under concurrency:
  // rows already flipped by another request no longer match, so two
  // overlapping deletes cannot flip the same row twice — and therefore cannot
  // both subtract it from the counter. The count comes from what THIS call
  // actually changed (modifiedCount), never from an assumed subtree size.
  async removeWithReplies(comment: {
    _id: Types.ObjectId;
    postId: Types.ObjectId;
  }): Promise<{ id: string; deletedAt: Date; deletedCount: number }> {
    const deletedAt = new Date();

    const result = await this.commentModel.updateMany(
      {
        postId: comment.postId,
        deletedAt: null,
        $or: [{ _id: comment._id }, { ancestorIds: comment._id }],
      },
      { $set: { deletedAt } },
      // Now that comments track updatedAt (for the edit feature), this has to
      // say so explicitly — otherwise soft-deleting a comment would bump its
      // updatedAt and make it look edited, exactly the bug already caught and
      // fixed for Post.commentCount's own bookkeeping writes.
      { timestamps: false },
    );
    const deletedCount = result.modifiedCount;

    // Nothing changed: another request deleted this subtree between the
    // caller's fetch and this write. From this caller's point of view the
    // comment is gone, so it is a 404 — and with no rows changed there is
    // nothing to subtract from the counter.
    if (deletedCount === 0) {
      throw new NotFoundException('Comment not found');
    }

    await this.recordRemovedComments(String(comment.postId), deletedCount);

    return { id: String(comment._id), deletedAt, deletedCount };
  }

  // Soft-deletes every live comment on a post, for when the post itself has
  // just been soft-deleted. One updateMany, the same shape as the comment
  // cascade above, and for the same reason: the comments stay as rows but
  // never read back, so nothing that later queries comments directly (search,
  // ranking, a "my comments" view) has to remember to join back to the post.
  //
  // `deletedAt: null` matters here too: a comment that was already deleted
  // keeps the timestamp it was deleted with, rather than being re-stamped as
  // if it had been removed along with the post.
  //
  // Post.commentCount is NOT touched. The post is gone, so the number no
  // longer describes anything anyone can read, and adjusting it would only
  // add a write that could fail. The caller passes the post's own deletedAt so
  // the post and its comments carry the same timestamp.
  async removeAllForPost(
    postId: Types.ObjectId,
    deletedAt: Date,
  ): Promise<number> {
    const result = await this.commentModel.updateMany(
      { postId, deletedAt: null },
      { $set: { deletedAt } },
      // Same reasoning as removeWithReplies above: this must not bump
      // updatedAt now that comments track edits.
      { timestamps: false },
    );
    return result.modifiedCount;
  }

  // The only mutation an edit performs: replace the body, nothing else.
  // `deletedAt: null` in the filter closes the (narrow) window between the
  // controller's ownership check and this write — a comment deleted in
  // between now 404s here instead of silently editing a dead row. No
  // optimistic concurrency: only the comment's own author can ever reach
  // this (assertMayEditComment), so the "two different actors racing"
  // scenario Post's version guard exists for doesn't apply here — the only
  // race is the same person editing from two tabs, a low-stakes case not
  // worth the extra machinery.
  //
  // Returns only {id, body, updatedAt}, not the full comment: an edit never
  // touches replies, author, or position in the thread, so returning the
  // full node (with its replies always empty, per toCommentNode) would be
  // actively misleading for a comment that already has real replies. The
  // caller already has the rest of the comment.
  async updateBody(
    id: string,
    body: string,
  ): Promise<{ id: string; body: string; updatedAt: Date }> {
    const comment = await this.commentModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { body } },
        { returnDocument: 'after' },
      )
      .select('body updatedAt')
      .exec();
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return {
      id: String(comment._id),
      body: comment.body,
      updatedAt: (comment as unknown as { updatedAt: Date }).updatedAt,
    };
  }

  // Subtracts what the cascade deleted from Post.commentCount.
  //
  // It is an update PIPELINE, not a plain $inc, because it has to clamp: a
  // count that drifted below the real number would otherwise go negative.
  //   commentCount = max(0, commentCount - n)
  // Mongoose 9 refuses an array update unless `updatePipeline: true` is set on
  // the call. `returnDocument: 'before'` hands back the value it started from,
  // which is how a clamp that actually bit is noticed and logged: reaching
  // zero means the count had already drifted, and that should not go quietly.
  // `timestamps: false` for the same reason as on create: bookkeeping must not
  // make the post look edited.
  //
  // If the update throws, the deletion has already happened and cannot be
  // undone, so the counter is repaired from the truth (a recount) instead. If
  // that fails too, the failure is logged and swallowed: the client is told
  // the delete succeeded, because it did, and a counter that needs repair is
  // bookkeeping trouble, not a reason to report a completed delete as failed.
  private async recordRemovedComments(
    postId: string,
    removed: number,
  ): Promise<void> {
    try {
      const before = await this.postModel.findOneAndUpdate(
        { _id: postId },
        [
          {
            $set: {
              commentCount: {
                $max: [0, { $subtract: ['$commentCount', removed] }],
              },
            },
          },
        ],
        {
          updatePipeline: true,
          timestamps: false,
          returnDocument: 'before',
          projection: { commentCount: 1 },
        },
      );
      if (before && before.commentCount < removed) {
        this.logger.warn(
          `commentCount for post ${postId} was ${before.commentCount} but ${removed} comments were removed; clamped to 0 — the count had drifted`,
        );
      }
      return;
    } catch (error) {
      this.logger.error(
        `commentCount decrement failed for post ${postId}; recounting instead`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      await this.recountCommentCount(postId);
    } catch (error) {
      this.logger.error(
        `recount failed for post ${postId}; commentCount needs repair`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // Works out where a new comment sits in the thread. A top-level comment
  // (no parent, or an explicit null) is a root: null parent, empty path.
  //
  // For a reply this is ONE query, and it answers both questions creation
  // needs: does the parent exist and is it live (found, deletedAt: null), and
  // is it on this same post (its postId). There is no depth check here and
  // none is coming: a reply is accepted at any depth, however deep the thread
  // already runs — depth only affects how the tree renders (buildCommentTree,
  // in comment-tree.ts), never whether a reply may be created. The same
  // document supplies the new comment's own path (childAncestorIds), so there
  // is no second query either way.
  //
  // The status codes separate "there is no such thing" from "there is, but
  // you may not": a missing or deleted parent is a 404 (a deleted parent is
  // simply not found, as far as the client is concerned), while a parent on
  // another post is a 400.
  private async resolveParent(
    postId: string,
    parentId: string | null | undefined,
  ): Promise<{
    parentCommentId: Types.ObjectId | null;
    ancestorIds: Types.ObjectId[];
  }> {
    if (!parentId) {
      return { parentCommentId: null, ancestorIds: [] };
    }

    const parent = await this.commentModel
      .findOne({ _id: parentId, deletedAt: null })
      .select('postId ancestorIds')
      .lean()
      .exec();
    if (!parent) {
      throw new NotFoundException('Parent comment not found');
    }
    if (String(parent.postId) !== postId) {
      throw new BadRequestException(
        'The parent comment belongs to a different post',
      );
    }

    return {
      parentCommentId: parent._id,
      ancestorIds: childAncestorIds(parent._id, parent.ancestorIds),
    };
  }

  // The comment is already stored; this makes commentCount agree with it.
  // There are no multi-document transactions in this backend (no replica set
  // is configured), so instead of "both or neither" the failure paths are
  // spelled out:
  //
  //   $inc succeeds                    -> done.
  //   $inc fails, delete succeeds      -> nothing was saved; tell the client.
  //   $inc fails, delete also fails    -> the comment is live but uncounted, so
  //                                       recount from the truth (below).
  //                                       If the recount works, the comment
  //                                       exists AND is counted, so the request
  //                                       succeeds; if it fails too, the error
  //                                       surfaces.
  //
  // `timestamps: false` on every write to Post here: commentCount is
  // bookkeeping, and without it each comment would bump the post's updatedAt,
  // which the API exposes — a post would look edited every time someone
  // commented on it.
  private async recordNewComment(
    postId: string,
    commentId: Types.ObjectId,
  ): Promise<void> {
    try {
      await this.postModel.updateOne(
        { _id: postId },
        { $inc: { commentCount: 1 } },
        { timestamps: false },
      );
      return;
    } catch (error) {
      this.logger.error(
        `commentCount increment failed for post ${postId}; rolling back comment ${commentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      await this.commentModel.deleteOne({ _id: commentId });
    } catch (error) {
      this.logger.error(
        `rollback of comment ${commentId} failed; recounting post ${postId} instead`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.recountCommentCount(postId);
      return;
    }

    throw new InternalServerErrorException(
      'The comment could not be saved. Please try again.',
    );
  }

  // Repair, not the normal path: sets commentCount from the comments
  // themselves. Uses the {postId, deletedAt, _id} index, so it is one indexed
  // count.
  private async recountCommentCount(postId: string): Promise<void> {
    const count = await this.commentModel.countDocuments({
      postId,
      deletedAt: null,
    });
    await this.postModel.updateOne(
      { _id: postId },
      { $set: { commentCount: count } },
      { timestamps: false },
    );
  }
}
