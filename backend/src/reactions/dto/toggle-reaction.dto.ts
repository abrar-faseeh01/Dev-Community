import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { REACTION_TYPES, type ReactionType } from '../schemas/reaction.schema';

// The same body for a post and for a comment. Which target it is comes from
// the URL, and who is reacting from the session — neither is accepted here,
// and the global pipe rejects any unknown property.
export class ToggleReactionDto {
  @ApiProperty({
    enum: REACTION_TYPES,
    example: 'like',
    description:
      'The reaction being asked for. Sending the type the caller already has removes it; sending the opposite type switches it.',
  })
  @IsIn(REACTION_TYPES)
  type: ReactionType;
}
