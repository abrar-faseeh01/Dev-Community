import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Arrays as the single source of truth: the schema's enum, the DTO's IsIn and
// the types below all come from these, so a new value is added in one place.
export const REACTION_TARGET_TYPES = ['post', 'comment'] as const;
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

export const REACTION_TYPES = ['like', 'dislike'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

// One row = one user's current reaction to one post or comment. Removing a
// reaction deletes the row; switching like <-> dislike edits `type` in place,
// so a user never has more than one row per target (see the index below).
//
// Timestamps are on for the audit trail only; nothing reads them. No
// optimisticConcurrency: rows are never fetched-then-saved, every change is a
// single atomic findOneAndDelete / findOneAndUpdate / insert.
@Schema({ timestamps: true })
export class Reaction extends Document {
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
  })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: REACTION_TARGET_TYPES })
  targetType: ReactionTargetType;

  // Points at a Post or a Comment depending on targetType, so there is no
  // single `ref` to declare. The service picks the model from targetType.
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  targetId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: REACTION_TYPES })
  type: ReactionType;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

// The database itself refuses a second reaction from the same user on the same
// target, so the guarantee holds even if two requests race past the
// application logic (the loser gets E11000, which the service handles).
//
// It also serves the one read the API makes: "which of these targets has this
// user reacted to" — {userId, targetType, targetId: {$in: [...]}} uses the
// index prefix, so no second index is added for it.
ReactionSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
