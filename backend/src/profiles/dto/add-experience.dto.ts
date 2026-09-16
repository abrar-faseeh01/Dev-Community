import { IsOptional, IsString } from 'class-validator';

export class AddExperienceDto {
  @IsString()
  title: string;

  @IsString()
  company: string;

  // Free-text, e.g. "2019" or "Jan 2021" — see schemas/user.schema.ts.
  @IsString()
  from: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never persisted onto the experience itself
  // (the controller strips it before calling ProfilesService).
  @IsOptional()
  @IsString()
  reason?: string;
}
