import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { MAX_COMMENT_BODY_LENGTH } from '../comment.constants';

// Full timestamps: only the comment's own author can edit it (PATCH
// comments/:id), and updatedAt is how a client tells a comment has been
// edited — createdAt never changes, so `updatedAt !== createdAt` is the
// whole signal. A never-edited comment has both fields identical, set
// together at creation. The two cascade deletes (removeWithReplies,
// removeAllForPost) both pass `timestamps: false` on their updateMany calls
// specifically so soft-deleting a comment never bumps this and makes it
// look edited.
//
// No optimisticConcurrency: that guard only fires on .save(), and nothing
// here is ever fetched-then-saved — edits go through one atomic
// findOneAndUpdate, and delete safety comes from the atomic `deletedAt:
// null` filter on the cascades' updateMany calls.
@Schema({ timestamps: true })
export class Comment extends Document {
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Post',
  })
  postId: Types.ObjectId;

  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
  })
  authorId: Types.ObjectId;

  // Explicitly null for a top-level comment rather than absent, the same
  // convention as Post.deletedAt — every document then stores the field, and
  // `{parentCommentId: null}` is an unambiguous query for "top level".
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Comment',
    default: null,
  })
  parentCommentId: Types.ObjectId | null;

  // Materialized path: every comment above this one, root first. Empty for a
  // top-level comment. Two things depend on it:
  //   - depth is ancestorIds.length + 1, so there is no parent chain to walk
  //     on write and no separate `depth` field that could drift out of sync;
  //   - the cascade delete is one atomic query — {$or: [{_id: target},
  //     {ancestorIds: target}]} matches the target and its whole subtree at
  //     once, instead of "find descendants, then mark them deleted", which
  //     leaves a window where a reply created in between survives under a
  //     deleted parent.
  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: 'Comment',
    default: [],
  })
  ancestorIds: Types.ObjectId[];

  @Prop({ required: true, trim: true, maxlength: MAX_COMMENT_BODY_LENGTH })
  body: string;

  // Soft delete, like Post — deleting a comment cascades to its whole
  // subtree, and a post's comments are cascaded when the post itself is
  // deleted, so the rows stay for the audit trail but never read back.
  // Denormalized reaction totals, changed only by the reactions module with
  // one atomic update per toggle (never recomputed on read). Comments created
  // before these fields existed have neither stored, which is why every read
  // path defaults them to 0 (toCommentRow) — `$inc` on a missing field
  // starts from 0, so the write side needs no backfill.
  @Prop({ default: 0 })
  likeCount: number;

  @Prop({ default: 0 })
  dislikeCount: number;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// The one query the read path makes: every live comment on a post, in _id
// order, which is chronological (ObjectIds embed a creation timestamp). The
// tree is then built in memory, so there is no second query per parent.
// Same shape as Post's feed index, with the post in front.
//
// Deliberately no index on parentCommentId or ancestorIds: the cascade's
// ancestorIds condition runs inside a single post's live comments through
// this index's {postId, deletedAt} prefix, which is cheap at this scale, and
// a second index would cost a write on every comment for no read that needs
// it.
CommentSchema.index({ postId: 1, deletedAt: 1, _id: 1 });
