import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/dto/trim.transform';
import { MAX_COMMENT_BODY_LENGTH } from '../comment.constants';

// The only thing an edit can ever change. There is no postId or
// parentCommentId here — a comment's post and its place in the thread are
// fixed at creation and stay that way for its whole life.
export class UpdateCommentDto {
  @ApiProperty({
    maxLength: MAX_COMMENT_BODY_LENGTH,
    example: 'The cursor approach also keeps the page stable while new posts arrive — edited for clarity.',
    description: 'The comment\'s new body. Trimmed before validation, so a whitespace-only value is rejected the same as an empty one, the same rule as on create.',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_BODY_LENGTH)
  body: string;
}
