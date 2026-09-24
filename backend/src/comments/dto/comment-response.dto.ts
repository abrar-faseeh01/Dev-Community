import { ApiProperty } from '@nestjs/swagger';
import {
  REACTION_TYPES,
  type ReactionType,
} from '../../reactions/schemas/reaction.schema';
import { AuthorSummaryDto } from '../../users/dto/author-summary.dto';
import { MAX_COMMENT_DEPTH } from '../comment.constants';

// One comment as the API returns it. ancestorIds, deletedAt and __v are
// never exposed (internal bookkeeping), and depth is implied by where the
// node sits.
export class CommentDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  id: string;

  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b9' })
  postId: string;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: null,
    description: 'null for a top-level comment; otherwise the comment this one replies to.',
  })
  parentCommentId: string | null;

  @ApiProperty({ example: 'The cursor approach also keeps the page stable while new posts arrive.' })
  body: string;

  @ApiProperty({ example: '2026-09-21T09:38:42.598Z' })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-21T09:38:42.598Z',
    description: 'Equal to createdAt until the comment is edited. Compare the two to show an "edited" indicator — the value itself is not meant to be displayed.',
  })
  updatedAt: Date;

  @ApiProperty({ example: 3, description: 'How many users currently like this comment.' })
  likeCount: number;

  @ApiProperty({ example: 0, description: 'How many users currently dislike this comment.' })
  dislikeCount: number;

  @ApiProperty({
    enum: REACTION_TYPES,
    nullable: true,
    example: null,
    description:
      "The caller's own reaction to this comment. null when the caller has none, is not signed in, or (on a just-created comment) cannot have one yet.",
  })
  myReaction: ReactionType | null;

  @ApiProperty({ type: AuthorSummaryDto })
  author: AuthorSummaryDto;

  // Self-referencing, so the type has to be lazy — at the point this
  // decorator runs, CommentDto is not finished being defined yet.
  @ApiProperty({
    type: () => [CommentDto],
    description: `This comment's full reply thread, oldest first. A reply nests here normally up to depth ${MAX_COMMENT_DEPTH}; anything deeper is included here too, as a direct entry, keeping its own true parentCommentId rather than nesting further. In practice this means only a top-level comment's replies is ever non-empty.`,
  })
  replies: CommentDto[];
}

export class CommentResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: CommentDto })
  data: CommentDto;
}

export class CommentListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({
    type: [CommentDto],
    description: 'Top-level comments, newest first, each carrying its replies. The whole tree for the post is returned — there is no pagination.',
  })
  data: CommentDto[];
}

class DeleteCommentDataDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  id: string;

  @ApiProperty({ example: '2026-09-21T09:52:34.218Z' })
  deletedAt: Date;

  @ApiProperty({
    example: 3,
    description: 'How many comments this call deleted: the target plus every reply beneath it.',
  })
  deletedCount: number;
}

export class DeleteCommentResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: DeleteCommentDataDto })
  data: DeleteCommentDataDto;
}

// Deliberately not the full CommentDto: an edit never changes the comment's
// replies, so returning replies: [] here would be misleading for a comment
// that already has some — the same reasoning DeleteCommentDataDto already
// follows. The caller already has the rest of the comment; this confirms
// only what an edit can actually change.
class EditCommentDataDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  id: string;

  @ApiProperty({ example: 'The cursor approach also keeps the page stable while new posts arrive — edited for clarity.' })
  body: string;

  @ApiProperty({
    example: '2026-09-22T10:15:00.598Z',
    description: 'The new edit timestamp — always different from the comment\'s createdAt after this call.',
  })
  updatedAt: Date;
}

export class EditCommentResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: EditCommentDataDto })
  data: EditCommentDataDto;
}
