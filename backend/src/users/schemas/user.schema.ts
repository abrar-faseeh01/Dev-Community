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

  @Prop({ required: true, enum: ['admin', 'user'], default: 'user' })
  role: UserRole;

  @Prop({ default: [] })
  skills: string[];

  @Prop({ type: [ExperienceSchema], default: [] })
  experiences: Types.DocumentArray<Experience>;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Second line of defense: even if select:false is bypassed somewhere,
// passwordHash never survives JSON serialization.
UserSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, any>) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});
