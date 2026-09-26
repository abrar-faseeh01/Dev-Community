import { ApiProperty } from '@nestjs/swagger';
import { AuthorSummaryDto } from '../../users/dto/author-summary.dto';
import { REACTION_TYPES, type ReactionType } from '../schemas/reaction.schema';

export class ReactionResultDto {
  @ApiProperty({ example: 4, description: 'The target\'s like count after this request.' })
  likeCount: number;

  @ApiProperty({ example: 1, description: 'The target\'s dislike count after this request.' })
  dislikeCount: number;

  @ApiProperty({
    enum: REACTION_TYPES,
    nullable: true,
    example: 'like',
    description:
      'The caller\'s own reaction after this request: the type they asked for after a create or a switch, null after a remove.',
  })
  myReaction: ReactionType | null;
}

export class ReactionResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReactionResultDto })
  data: ReactionResultDto;
}

export class ReactorDto {
  @ApiProperty({
    type: AuthorSummaryDto,
    description:
      'Who reacted: id, name and headline only. A deleted account is the "Deleted user" placeholder.',
  })
  user: AuthorSummaryDto;

  @ApiProperty({ enum: REACTION_TYPES, example: 'like' })
  type: ReactionType;
}

export class ReactorListDto {
  @ApiProperty({
    type: [ReactorDto],
    description:
      'The most recent reactors first, at most 50. Filtered by `type` when that is given.',
  })
  items: ReactorDto[];

  @ApiProperty({
    example: 12,
    description:
      'The target\'s total like count, the same number shown next to the buttons. Not affected by `type` or by the 50 cap.',
  })
  likeCount: number;

  @ApiProperty({
    example: 2,
    description: 'The target\'s total dislike count. Not affected by `type` or by the cap.',
  })
  dislikeCount: number;
}

export class ReactorListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReactorListDto })
  data: ReactorListDto;
}
