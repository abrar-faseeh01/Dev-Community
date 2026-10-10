import { HttpException } from '@nestjs/common';

export const CHANGELOG_PROVIDER = Symbol('CHANGELOG_PROVIDER');

export interface MergedPr {
  prNumber: number;
  title: string;
  authorLogin: string;
  mergedAt: Date;
  htmlUrl: string;
  baseBranch: string;
  /** The PR description as Markdown. Empty string when the author left it blank. */
  body: string;
}

export interface ChangelogProvider {
  readonly source: 'mock' | 'github';
  /** The most recently merged PR into main, or null if none was ever merged. */
  getLastMergedPr(owner: string, repo: string): Promise<MergedPr | null>;
}

export type ChangelogErrorCode =
  | 'GITHUB_FORBIDDEN'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_TIMEOUT'
  | 'GITHUB_UNAVAILABLE'
  | 'GITHUB_AUTH_FAILED'
  | 'REPO_NOT_FOUND';

// What each code looks like to the caller. 401 is deliberately never used: the
// frontend treats it as "your session expired" and redirects to /login, but a
// bad GitHub credential is the server's problem, not the caller's.
const HTTP_STATUS: Record<ChangelogErrorCode, number> = {
  REPO_NOT_FOUND: 404,
  GITHUB_FORBIDDEN: 502,
  GITHUB_AUTH_FAILED: 502,
  GITHUB_UNAVAILABLE: 503,
  GITHUB_RATE_LIMITED: 503,
  GITHUB_TIMEOUT: 504,
};

const MESSAGES: Record<ChangelogErrorCode, string> = {
  REPO_NOT_FOUND:
    'Repository not found, or the GitHub App is not installed on it.',
  GITHUB_FORBIDDEN: 'GitHub refused the request (the App lacks permission).',
  GITHUB_AUTH_FAILED: 'GitHub rejected the App credentials.',
  GITHUB_UNAVAILABLE: 'GitHub is unreachable or having problems.',
  GITHUB_RATE_LIMITED: 'GitHub rate limit reached. Try again later.',
  GITHUB_TIMEOUT: 'GitHub took too long to respond.',
};

/**
 * The only error a provider may throw. The message is fixed text per code, so
 * no token, key or upstream body can end up in it (or in a log of it). The
 * response body is the stable `{ code, message }` shape.
 */
export class ChangelogSyncError extends HttpException {
  constructor(readonly code: ChangelogErrorCode) {
    super({ code, message: MESSAGES[code] }, HTTP_STATUS[code]);
  }
}
