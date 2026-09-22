import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, Validate, ValidateIf } from 'class-validator';
import { trimString } from '../../common/dto/trim.transform';
import { TitleOrBodyConstraint } from './title-or-body.validator';

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
  // ValidateIf, not @IsOptional(): @IsOptional() skips validation for null as
  // well as undefined, so `{"body": null}` passed every check here (and
  // TitleOrBodyConstraint, which only asks whether body is undefined), then
  // the service assigned null to a required field and Mongoose threw — a
  // bare 500. This skips validation only when body is genuinely absent (a
  // partial update that leaves body alone), so an explicit null gets the same
  // "body should not be empty" / "body must be a string" 400 as any other
  // bad value. title needs no equivalent: it has no @IsOptional(), and
  // TitleOrBodyConstraint already rejects a null title.
  @Transform(trimString)
  @ValidateIf((dto: UpdatePostDto) => dto.body !== undefined)
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
