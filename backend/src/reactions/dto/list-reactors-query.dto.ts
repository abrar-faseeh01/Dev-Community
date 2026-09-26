import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { REACTION_TYPES, type ReactionType } from '../schemas/reaction.schema';

// The only query parameter of both reactor-list routes. The global pipe
// rejects anything else.
export class ListReactorsQueryDto {
  @ApiPropertyOptional({
    enum: REACTION_TYPES,
    description:
      'Only list people who gave this reaction. Omit for everyone. The counts in the response are unaffected.',
  })
  @IsOptional()
  @IsIn(REACTION_TYPES)
  type?: ReactionType;
}
