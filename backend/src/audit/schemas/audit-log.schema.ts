import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditAction =
  | 'update_skills'
  | 'add_experience'
  | 'update_experience'
  | 'remove_experience'
  | 'update_fullname'
  | 'update_headline'
  | 'update_bio'
  | 'update_portfolio_projects'
  | 'delete_user';

const AUDIT_ACTIONS: AuditAction[] = [
  'update_skills',
  'add_experience',
  'update_experience',
  'remove_experience',
  'update_fullname',
  'update_headline',
  'update_bio',
  'update_portfolio_projects',
  'delete_user',
];

// Append-only: entries are never updated or deleted, so only createdAt is
// tracked (no updatedAt).
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  adminId: Types.ObjectId;

  // Denormalized so the audit trail reads without a join even if the
  // admin's own name changes later.
  @Prop({ required: true })
  adminFullName: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  targetUserId: Types.ObjectId;

  @Prop({ required: true })
  targetFullName: string;

  @Prop({ required: true, enum: AUDIT_ACTIONS })
  action: AuditAction;

  // Just the relevant changed data (e.g. { skills: [...] }), not the whole
  // user document.
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  previousState: Record<string, unknown> | null;

  // null for delete_user — there is no "after" state.
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  newState: Record<string, unknown> | null;

  @Prop()
  reason?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
