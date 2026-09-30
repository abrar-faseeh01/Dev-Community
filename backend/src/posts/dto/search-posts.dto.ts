import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/dto/trim.transform';

export class SearchPostsDto {
  // 100 is far more than any real search term and bounds the cost of one
  // $text query — the "protect from abusive queries" requirement. Nothing in
  // plan.md or spec.md sets it, so it is flagged here rather than invented
  // silently. Trimmed first so whitespace-only input gets the same 400 as an
  // empty one, and the length limit applies to what is actually searched.
  @ApiProperty({
    maxLength: 100,
    example: 'cursor pagination',
    description:
      'Words to search for in post titles and bodies (whole words, stemmed).',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;

  // 20 keeps this a short "best matches" list rather than a feed. Chosen
  // here for the same reason as the 100 above.
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 20,
    default: 10,
    description: 'How many results to return at most.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}
