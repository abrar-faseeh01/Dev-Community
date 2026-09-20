import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import { TitleOrBodyConstraint } from './title-or-body.validator';
import { trimString } from './trim.transform';

export class UpdatePostDto {
  // No standard-precedent "at least one of these" validator exists in
  // this codebase (UpdateProfileDto/UpdateExperienceDto are fully-partial
  // with no such rule) — TitleOrBodyConstraint follows this codebase's
  // one existing cross-field-validation idiom instead (EndDateConstraint).
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'At least one of title or body is required.',
    example: 'Why we switched to cursor pagination (updated)',
  })
  @Transform(trimString)
  @Validate(TitleOrBodyConstraint)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20000, example: 'Updated with benchmark numbers from production.' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body?: string;

  // Only meaningful when an admin edits someone else's post — recorded on
  // the audit log entry, never applied to the post itself. Same
  // convention as UpdateSkillsDto/UpdateHeadlineDto etc.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s post.',
    example: 'contains a policy violation',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
