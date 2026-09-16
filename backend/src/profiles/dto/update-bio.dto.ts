import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBioDto {
  // Full replace, same convention as UpdateSkillsDto/UpdateFullNameDto —
  // required so the intended value is always explicit, never merged.
  @IsString()
  @MaxLength(1000)
  bio: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @IsOptional()
  @IsString()
  reason?: string;
}
