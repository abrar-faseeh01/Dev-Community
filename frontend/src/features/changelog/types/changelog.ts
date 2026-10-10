// Mirrors backend/src/changelog/dto/changelog-response.dto.ts.
export type ChangelogEntry = {
  _id: string;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  authorLogin: string;
  mergedAt: string;
  htmlUrl: string;
  baseBranch: string;
  // Markdown written on GitHub; "" when the PR had no description. Rows
  // stored before this field existed may not have it.
  body?: string;
  syncedAt: string;
};
