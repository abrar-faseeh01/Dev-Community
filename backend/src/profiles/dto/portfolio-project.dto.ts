import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Validate,
} from 'class-validator';
import { EndDateConstraint } from './end-date.validator';

export class PortfolioProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // require_protocol so a bare "example.com" (not directly clickable/linkable
  // as-is) is rejected — a live-demo link should be unambiguous.
  @IsUrl(
    { require_protocol: true },
    { message: 'liveUrl must be a valid URL (including http:// or https://)' },
  )
  liveUrl: string;

  // Same validator as liveUrl, per spec — deliberately not restricted to
  // github.com hosts specifically, just "a valid URL".
  @IsUrl(
    { require_protocol: true },
    { message: 'githubUrl must be a valid URL (including http:// or https://)' },
  )
  githubUrl: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  technologies: string[];

  @IsDateString()
  startDate: string;

  // No @IsOptional() — EndDateConstraint must run even when this is
  // undefined, since "undefined" is itself a validation failure whenever
  // isCurrent is false. See end-date.validator.ts for the full rule set.
  @Validate(EndDateConstraint)
  endDate?: string;

  @IsBoolean()
  isCurrent: boolean;
}
