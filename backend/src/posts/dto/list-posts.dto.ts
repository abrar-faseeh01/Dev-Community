import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListPostsDto {
  // No default/max is decided anywhere in plan.md or spec.md — 10/50
  // chosen here as a reasonable feed page size, flagged explicitly rather
  // than invented silently.
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 50,
    default: 10,
    description: 'Page size.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Base64-encoded id of the last post seen — pass the previous response\'s nextCursor to get the next page. Omit for the first page.',
    example: 'NmFhZDA2YjQ0OWUyYzRlMDM0ZGE5ZTAx',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
