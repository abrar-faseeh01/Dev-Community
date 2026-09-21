import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Only list posts written by this user. Same ordering, paging and soft-delete rules as the unfiltered feed.',
    example: '64f1c2e5a1b2c3d4e5f6a7b8',
  })
  @IsOptional()
  @IsMongoId()
  authorId?: string;
}
