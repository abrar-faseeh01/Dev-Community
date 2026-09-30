import { ApiProperty } from '@nestjs/swagger';
import {
  REACTION_TYPES,
  type ReactionType,
} from '../../reactions/schemas/reaction.schema';
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

  @ApiProperty({
    example: 3,
    description: 'How many users currently like this post.',
  })
  likeCount: number;

  @ApiProperty({
    example: 0,
    description: 'How many users currently dislike this post.',
  })
  dislikeCount: number;

  @ApiProperty({
    example: 0,
    description: 'Denormalized counter — inert until Day 9 (Comments).',
  })
  commentCount: number;

  @ApiProperty({
    enum: REACTION_TYPES,
    nullable: true,
    example: null,
    description:
      "The caller's own reaction to this post. null when the caller has none, is not signed in, or (on a just-created post) cannot have one yet.",
  })
  myReaction: ReactionType | null;

  @ApiProperty({
    type: 'number',
    nullable: true,
    example: 92.2157,
    description:
      'The ranking score this post was sorted by under sort=top, read directly from the database query, never recomputed. null under sort=latest/discussed, where no score is computed.',
  })
  rankScore: number | null;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Soft-delete timestamp; null while the post is live.',
  })
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
    description:
      'Pass as `cursor` to fetch the next page. null means there is no next page.',
  })
  nextCursor: string | null;
}

export class PostListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostListDataDto })
  data: PostListDataDto;
}

class PostSearchDataDto {
  @ApiProperty({
    type: [PostDto],
    description:
      'Best matches first (highest text relevance; newest first among equal scores).',
  })
  items: PostDto[];

  @ApiProperty({
    example: false,
    description:
      'true when more posts matched than were returned. There is no next page to fetch: refine the search instead.',
  })
  hasMore: boolean;
}

export class PostSearchResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostSearchDataDto })
  data: PostSearchDataDto;
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
