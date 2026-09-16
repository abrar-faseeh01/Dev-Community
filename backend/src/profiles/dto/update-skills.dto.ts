import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSkillsDto {
  // Full replace: the whole array is sent and stored as-is. An empty array
  // is a valid update (clearing all skills).
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills: string[];

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @IsOptional()
  @IsString()
  reason?: string;
}
