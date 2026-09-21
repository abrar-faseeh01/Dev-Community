import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Post extends Document {
  // No standalone index here — {authorId: 1, createdAt: -1} below already
  // serves an authorId-only equality lookup via its leftmost prefix, so a
  // second single-field index would just double the write cost for no
  // query this plan actually needs.
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
  })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 20000 })
  body: string;

  // Denormalized running totals only — inert until Day 9 (comments) and
  // Day 11 (reactions) start incrementing/decrementing them atomically.
  @Prop({ default: 0 })
  likeCount: number;

  @Prop({ default: 0 })
  dislikeCount: number;

  @Prop({ default: 0 })
  commentCount: number;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Feed query: filter deletedAt, sort/cursor on _id alone. Revised from an
// original {deletedAt, createdAt, _id} index — posts are only ever
// created in real time, never backdated, so _id descending (ObjectIds
// embed a creation timestamp) already matches createdAt descending, and
// a single range condition after the deletedAt prefix gets genuinely
// tight index bounds where the {createdAt, _id} $or shape couldn't.
PostSchema.index({ deletedAt: 1, _id: -1 });

// Per-author query: filter authorId, sort createdAt desc. Also serves any
// authorId-only equality lookup via its leftmost prefix.
PostSchema.index({ authorId: 1, createdAt: -1 });

// One author's live posts, newest first, paged by an _id cursor — the
// GET /posts?authorId= query. The {authorId, createdAt} index above can't
// serve an _id sort (it would fetch and sort all of that author's posts),
// so this one puts _id last, the same shape as the feed index.
PostSchema.index({ authorId: 1, deletedAt: 1, _id: -1 });
