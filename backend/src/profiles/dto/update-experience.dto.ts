import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Partial update: every field optional, only the ones present are applied.
export class UpdateExperienceDto {
  @ApiPropertyOptional({ example: 'Senior Software Engineer' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Free text, not a parsed date.', example: '2021' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2023' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 'Promoted; led the payments team.' })
  @IsOptional()
  @IsString()
  description?: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry. The controller strips this before calling
  // ProfilesService.updateExperience(), which otherwise treats every present
  // key in the dto as a field to $set on the experience subdocument.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'corrected job title',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
