import { ApiProperty } from '@nestjs/swagger';

export class ChangelogEntryDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7f0' })
  _id: string;

  @ApiProperty({ example: 'octocat' })
  owner: string;

  @ApiProperty({ example: 'hello-world' })
  repo: string;

  @ApiProperty({ example: 42 })
  prNumber: number;

  @ApiProperty({ example: 'Add changelog page' })
  title: string;

  @ApiProperty({ example: 'octocat' })
  authorLogin: string;

  @ApiProperty({ example: '2026-10-08T12:00:00.000Z' })
  mergedAt: Date;

  @ApiProperty({ example: 'https://github.com/octocat/hello-world/pull/42' })
  htmlUrl: string;

  @ApiProperty({ example: 'main' })
  baseBranch: string;

  @ApiProperty({
    example: '## What changed\n\n- Adds the changelog page',
    description:
      'The PR description as Markdown (at most 10000 characters, empty if none). Untrusted text written on GitHub: render it as Markdown without raw HTML.',
  })
  body: string;

  @ApiProperty({ example: '2026-10-09T08:00:00.000Z' })
  syncedAt: Date;
}

export class ChangelogListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: [ChangelogEntryDto] })
  data: ChangelogEntryDto[];
}

export class ChangelogSyncResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({
    type: ChangelogEntryDto,
    nullable: true,
    description: 'null when the repository has no PR merged into main.',
  })
  data: ChangelogEntryDto | null;
}
