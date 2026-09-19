import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHeadlineDto {
  // Full replace, same convention as UpdateSkillsDto/UpdateFullNameDto —
  // required so the intended value is always explicit, never merged.
  @ApiProperty({ maxLength: 120, example: 'Senior Backend Engineer @ Acme' })
  @IsString()
  @MaxLength(120)
  headline: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'corrected outdated title',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
