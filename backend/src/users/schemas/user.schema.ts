import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'user';

// from/to are free-text strings ("2019", "Jan 2021", "Q3 2022"), not Date.
// Resumes rarely carry day-level precision, and requiring a parseable date
// would reject the vague-but-common ways people actually describe when a
// role started or ended. `to` is simply absent for an ongoing role — no
// sentinel value needed.
@Schema({ _id: true }) // Mongoose's default for a subdocument array anyway — explicit here since each experience needs its own targetable _id.
export class Experience {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  company: string;

  @Prop({ required: true })
  from: string;

  @Prop()
  to?: string;

  @Prop()
  description?: string;
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);

// Storage shape only — the conditional isCurrent/endDate/startDate rules
// are enforced by PortfolioProjectDto's custom validator (class-validator),
// not here. Keeping the schema "dumb" means there's exactly one place
// (the DTO) that decides what a bad payload looks like and how it's
// rejected; the schema just describes what a valid document contains.
@Schema({ _id: true }) // each project needs its own targetable _id, same reasoning as Experience.
export class PortfolioProject {
  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ required: true })
  liveUrl: string;

  @Prop({ required: true })
  githubUrl: string;

  @Prop({ type: [String], default: [] })
  technologies: string[];

  @Prop({ required: true })
  startDate: Date;

  @Prop()
  endDate?: Date;

  @Prop({ required: true, default: false })
  isCurrent: boolean;
}

export const PortfolioProjectSchema =
  SchemaFactory.createForClass(PortfolioProject);

@Schema({ timestamps: true, optimisticConcurrency: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  // Never a `password` field — select:false so it's never returned by default,
  // and never touched by any pre-save hook (hashing happens only in AuthService).
  @Prop({ required: true, select: false })
  passwordHash: string;

  // SHA-256 hashes of this user's live refresh tokens, one per signed-in
  // device, newest last and capped at 5 (see UsersService.addRefreshHash). The
  // token itself is never stored. select:false and the toJSON strip below are
  // the same two layers as passwordHash.
  @Prop({ type: [String], default: [], select: false })
  refreshTokenHashes: string[];

  @Prop({ required: true, enum: ['admin', 'user'], default: 'user' })
  role: UserRole;

  @Prop({ default: [] })
  skills: string[];

  @Prop({ type: [ExperienceSchema], default: [] })
  experiences: Types.DocumentArray<Experience>;

  // headline/bio/portfolioProjects are the Day 5 "developer profile" fields —
  // they coexist with the older skills/experiences fields rather than
  // replacing them; nothing here removes or repurposes experiences.
  @Prop({ trim: true, maxlength: 120 })
  headline?: string;

  @Prop({ trim: true, maxlength: 1000 })
  bio?: string;

  @Prop({ type: [PortfolioProjectSchema], default: [] })
  portfolioProjects: Types.DocumentArray<PortfolioProject>;

  // Set by the mail worker once the welcome email has gone out. It is the
  // idempotency marker: a retried or duplicated job sees it and sends nothing.
  // null (or absent, for users that existed before this field) means not sent.
  @Prop({ type: Date, default: null })
  welcomeEmailSentAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Second line of defense: even if select:false is bypassed somewhere,
// passwordHash never survives JSON serialization.
UserSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, any>) => {
    delete ret.passwordHash;
    delete ret.refreshTokenHashes;
    delete ret.welcomeEmailSentAt;
    delete ret.__v;
    return ret;
  },
});
