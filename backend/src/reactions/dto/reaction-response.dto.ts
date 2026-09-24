import { ApiProperty } from '@nestjs/swagger';
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
