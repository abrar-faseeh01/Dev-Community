import { ApiProperty } from '@nestjs/swagger';
import {
  MAX_TAGS,
  SUMMARY_MAX_LENGTH,
  TAG_MAX_LENGTH,
} from '../summary.schema';

export class PostSummaryDto {
  @ApiProperty({
    maxLength: SUMMARY_MAX_LENGTH,
    example:
      'The author explains why they moved from offset to cursor pagination and what it changed.',
  })
  summary: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_TAGS,
    example: ['pagination', 'MongoDB'],
    description: `Skill or technology tags, each up to ${TAG_MAX_LENGTH} characters. Plain text: render it as text, never as markup.`,
  })
  tags: string[];

  @ApiProperty({
    enum: ['mock', 'gemini'],
    example: 'gemini',
    description:
      "Which summarizer produced this. 'mock' is the deterministic extractive fallback (first sentences plus keyword tags), not a model-written summary.",
  })
  source: 'mock' | 'gemini';

  @ApiProperty({
    example: false,
    description:
      'true when the post was longer than 8000 characters and only the first part was summarized.',
  })
  truncated: boolean;
}

export class PostSummaryResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostSummaryDto })
  data: PostSummaryDto;
}
