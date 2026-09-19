import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ maxLength: 120, example: 'Realtime Chat App' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ maxLength: 1000, example: 'A WebSocket-based chat app with rooms and presence.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // require_protocol so a bare "example.com" (not directly clickable/linkable
  // as-is) is rejected — a live-demo link should be unambiguous.
  @ApiProperty({ example: 'https://chat-demo.example.com' })
  @IsUrl(
    { require_protocol: true },
    { message: 'liveUrl must be a valid URL (including http:// or https://)' },
  )
  liveUrl: string;

  // Same validator as liveUrl, per spec — deliberately not restricted to
  // github.com hosts specifically, just "a valid URL".
  @ApiProperty({ example: 'https://github.com/example/chat-app' })
  @IsUrl(
    { require_protocol: true },
    { message: 'githubUrl must be a valid URL (including http:// or https://)' },
  )
  githubUrl: string;

  @ApiProperty({ type: [String], maxItems: 20, example: ['typescript', 'socket.io', 'redis'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  technologies: string[];

  @ApiProperty({ example: '2025-01-15' })
  @IsDateString()
  startDate: string;

  // No @IsOptional() — EndDateConstraint must run even when this is
  // undefined, since "undefined" is itself a validation failure whenever
  // isCurrent is false. See end-date.validator.ts for the full rule set.
  @ApiPropertyOptional({
    description: 'Required when isCurrent is false; must be omitted (or later validated against) when isCurrent is true.',
    example: '2025-06-30',
  })
  @Validate(EndDateConstraint)
  endDate?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isCurrent: boolean;
}
