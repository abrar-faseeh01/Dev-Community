import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// owner: 1-39 letters, digits or hyphens. repo: letters, digits, "." "_" "-",
// but never just "." or ".." (they would change the URL path).
export const REPO_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export class SyncChangelogDto {
  @ApiProperty({ example: 'octocat/hello-world', description: '`owner/repo`.' })
  @Matches(REPO_PATTERN, { message: 'repo must look like "owner/repo"' })
  repo: string;
}
