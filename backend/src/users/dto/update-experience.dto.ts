import { IsOptional, IsString } from 'class-validator';

// Partial update: every field optional, only the ones present are applied.
export class UpdateExperienceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry. The controller strips this before calling
  // UsersService.updateExperience(), which otherwise treats every present
  // key in the dto as a field to $set on the experience subdocument.
  @IsOptional()
  @IsString()
  reason?: string;
}
