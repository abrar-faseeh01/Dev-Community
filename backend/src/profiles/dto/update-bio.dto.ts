import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBioDto {
  // Full replace, same convention as UpdateSkillsDto/UpdateFullNameDto —
  // required so the intended value is always explicit, never merged.
  @ApiProperty({ maxLength: 1000, example: 'I build backend systems and enjoy mentoring junior engineers.' })
  @IsString()
  @MaxLength(1000)
  bio: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'removed inappropriate content',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
