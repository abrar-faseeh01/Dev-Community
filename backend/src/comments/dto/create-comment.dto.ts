import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/dto/trim.transform';
import { MAX_COMMENT_BODY_LENGTH } from '../comment.constants';

// The single create body for both a top-level comment and a reply — there is
// no separate reply endpoint, so there is one way to do one thing. What makes
// it a reply is parentCommentId; the post always comes from the :postId path
// parameter, and the author always from the session, never the body.
export class CreateCommentDto {
  // Trimmed before validation, the same as CreatePostDto: without it a
  // whitespace-only body passes @IsNotEmpty() and only fails later inside
  // Mongoose, which surfaces as a bare 500 instead of a 400.
  @ApiProperty({
    maxLength: MAX_COMMENT_BODY_LENGTH,
    example: 'The cursor approach also keeps the page stable while new posts arrive.',
    description: 'Plain text. Trimmed before validation, so the length limit applies to what is actually stored and a whitespace-only body is rejected.',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_BODY_LENGTH)
  body: string;

  // @IsOptional() skips validation for null as well as undefined, so a client
  // may either omit this field or send an explicit null for a top-level
  // comment; both are accepted and mean the same thing.
  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    example: '64f1c2e5a1b2c3d4e5f6a7c0',
    description: 'The comment being replied to. Omit it, or send null, for a top-level comment. It must be a live comment on this same post (a parent from another post is a 400, a deleted or unknown one a 404) — a reply is accepted at any depth, however deep the thread already runs.',
  })
  @IsOptional()
  @IsMongoId()
  parentCommentId?: string | null;
}
