import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One merged pull request. owner and repo are stored lowercase (GitHub treats
// them case-insensitively), so the unique index below can't be dodged by
// syncing "Acme/Web" after "acme/web".
@Schema({ timestamps: false })
export class ChangelogEntry extends Document {
  @Prop({ required: true })
  owner: string;

  @Prop({ required: true })
  repo: string;

  @Prop({ required: true })
  prNumber: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  authorLogin: string;

  @Prop({ required: true })
  mergedAt: Date;

  @Prop({ required: true })
  htmlUrl: string;

  @Prop({ required: true })
  baseBranch: string;

  // Markdown, untrusted (written by whoever opened the PR). Not required, so
  // rows stored before this field existed still load.
  @Prop({ default: '' })
  body: string;

  @Prop({ required: true })
  syncedAt: Date;
}

export const ChangelogEntrySchema =
  SchemaFactory.createForClass(ChangelogEntry);

// Syncing the same PR twice updates one document instead of adding a second.
ChangelogEntrySchema.index(
  { owner: 1, repo: 1, prNumber: 1 },
  { unique: true },
);
// The list is always read newest-merged first.
ChangelogEntrySchema.index({ mergedAt: -1 });
