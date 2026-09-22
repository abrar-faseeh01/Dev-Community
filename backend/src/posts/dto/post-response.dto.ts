import { ApiProperty } from '@nestjs/swagger';
import { AuthorSummaryDto } from '../../users/dto/author-summary.dto';

// The shape returned by create/list/detail/update — never the raw
// document, so authorId (a bare ObjectId on the schema) never leaks
// unpopulated, and the populated author is narrowed to exactly
// {id, fullName, headline}.
export class PostDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  id: string;

  @ApiProperty({ example: 'Why we switched to cursor pagination' })
  title: string;

  @ApiProperty({ example: 'Offset pagination degrades as pages get deeper...' })
  body: string;

  @ApiProperty({ example: 0, description: 'Denormalized counter — inert until Day 11 (Reactions).' })
  likeCount: number;

  @ApiProperty({ example: 0, description: 'Denormalized counter — inert until Day 11 (Reactions).' })
  dislikeCount: number;

  @ApiProperty({ example: 0, description: 'Denormalized counter — inert until Day 9 (Comments).' })
  commentCount: number;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true, example: null, description: 'Soft-delete timestamp; null while the post is live.' })
  deletedAt: Date | null;

  @ApiProperty({ example: '2026-09-18T09:38:42.598Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-18T09:38:42.598Z' })
  updatedAt: Date;

  @ApiProperty({ type: AuthorSummaryDto })
  author: AuthorSummaryDto;
}

export class PostResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostDto })
  data: PostDto;
}

class PostListDataDto {
  @ApiProperty({ type: [PostDto] })
  items: PostDto[];

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'NmFhZDA2YjQ0OWUyYzRlMDM0ZGE5ZTAx',
    description: 'Pass as `cursor` to fetch the next page. null means there is no next page.',
  })
  nextCursor: string | null;
}

export class PostListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostListDataDto })
  data: PostListDataDto;
}

class DeletePostDataDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  id: string;

  @ApiProperty({ example: '2026-09-18T09:52:34.218Z' })
  deletedAt: Date;
}

export class DeletePostResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: DeletePostDataDto })
  data: DeletePostDataDto;
}
