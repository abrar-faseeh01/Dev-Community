import { ApiProperty } from '@nestjs/swagger';

// The author as every content route returns it — posts and comments alike.
// One class, so the two can't drift into two slightly different shapes, and
// so the Swagger document describes the author exactly once. It mirrors
// `AuthorSummary` in ../author-summary.ts, which is what actually builds it.
export class AuthorSummaryDto {
  @ApiProperty({
    type: 'string',
    nullable: true,
    example: '64f1c2e5a1b2c3d4e5f6a7b8',
    description: 'null when the author\'s account has been deleted.',
  })
  id: string | null;

  @ApiProperty({
    example: 'Ada Lovelace',
    description: '"Deleted user" when the author\'s account has been deleted.',
  })
  fullName: string;

  @ApiProperty({
    type: 'string',
    required: false,
    nullable: true,
    example: 'Senior Backend Engineer @ Acme',
    description: 'Absent when the author has no headline; null when the author\'s account has been deleted.',
  })
  headline?: string | null;
}
