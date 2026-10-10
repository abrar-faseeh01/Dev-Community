import { createSign } from 'node:crypto';
import {
  ChangelogErrorCode,
  ChangelogProvider,
  ChangelogSyncError,
  MergedPr,
} from './changelog.provider';

const API = 'https://api.github.com';
const TIMEOUT_MS = 2500;
// A PR description can be enormous; only this much is stored and shown.
const MAX_BODY_LENGTH = 10000;

export interface GithubAppSettings {
  appId: string;
  installationId: string;
  privateKey: string;
}

type Stage = 'token' | 'pulls';

interface RawPr {
  number?: unknown;
  title?: unknown;
  merged_at?: unknown;
  html_url?: unknown;
  user?: { login?: unknown } | null;
  base?: { ref?: unknown } | null;
  body?: unknown;
}

const b64url = (input: string | Buffer) =>
  Buffer.from(input).toString('base64url');

// A fetch or body-read failure: the shared deadline firing is a timeout,
// anything else (DNS, refused, reset) is "unavailable".
function networkError(err: unknown): ChangelogSyncError {
  const name = (err as { name?: string } | null)?.name;
  return new ChangelogSyncError(
    name === 'TimeoutError' || name === 'AbortError'
      ? 'GITHUB_TIMEOUT'
      : 'GITHUB_UNAVAILABLE',
  );
}

export class GithubAppProvider implements ChangelogProvider {
  readonly source = 'github' as const;

  constructor(private readonly settings: GithubAppSettings) {}

  async getLastMergedPr(owner: string, repo: string): Promise<MergedPr | null> {
    // One deadline for the whole sync: both calls share it, so the request
    // cannot take 2 x 2.5 s.
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    const token = await this.installationToken(signal);
    const pulls = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50`,
      token,
      'pulls',
      signal,
    );
    if (!Array.isArray(pulls)) {
      throw new ChangelogSyncError('GITHUB_UNAVAILABLE');
    }

    let latest: MergedPr | null = null;
    for (const raw of pulls as RawPr[]) {
      const pr = toMergedPr(raw);
      if (pr && (!latest || pr.mergedAt > latest.mergedAt)) latest = pr;
    }
    return latest;
  }

  private async installationToken(signal: AbortSignal): Promise<string> {
    const body = (await this.request(
      `/app/installations/${encodeURIComponent(this.settings.installationId)}/access_tokens`,
      this.appJwt(),
      'token',
      signal,
      'POST',
    )) as { token?: unknown } | null;
    if (typeof body?.token !== 'string' || body.token === '') {
      throw new ChangelogSyncError('GITHUB_AUTH_FAILED');
    }
    return body.token;
  }

  // RS256 JWT for the App itself. iat is backdated a minute for clock drift;
  // GitHub allows at most 10 minutes of lifetime.
  private appJwt(): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
        JSON.stringify({
          iat: now - 60,
          exp: now + 9 * 60,
          iss: this.settings.appId,
        }),
      )}`;
      const signature = createSign('RSA-SHA256')
        .update(unsigned)
        .sign(this.settings.privateKey.replace(/\\n/g, '\n'));
      return `${unsigned}.${b64url(signature)}`;
    } catch {
      // A malformed key: report it without quoting anything from the error.
      throw new ChangelogSyncError('GITHUB_AUTH_FAILED');
    }
  }

  private async request(
    path: string,
    bearer: string,
    stage: Stage,
    signal: AbortSignal,
    method = 'GET',
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'dev-community-changelog',
        },
      });
    } catch (err) {
      throw networkError(err);
    }

    if (!res.ok) throw new ChangelogSyncError(mapStatus(res, stage));

    try {
      return await res.json();
    } catch (err) {
      throw networkError(err);
    }
  }
}

// Status only; the upstream body is never read on an error.
function mapStatus(res: Response, stage: Stage): ChangelogErrorCode {
  const { status } = res;
  if (status === 429) return 'GITHUB_RATE_LIMITED';
  if (status === 403) {
    return res.headers.get('x-ratelimit-remaining') === '0'
      ? 'GITHUB_RATE_LIMITED'
      : 'GITHUB_FORBIDDEN';
  }
  if (status === 401) return 'GITHUB_AUTH_FAILED';
  if (status === 404) {
    // A 404 while minting the token means a wrong installation id, not a
    // missing repository.
    return stage === 'token' ? 'GITHUB_AUTH_FAILED' : 'REPO_NOT_FOUND';
  }
  return 'GITHUB_UNAVAILABLE';
}

function toMergedPr(raw: RawPr): MergedPr | null {
  if (typeof raw?.merged_at !== 'string') return null; // closed, never merged
  const mergedAt = new Date(raw.merged_at);
  if (
    Number.isNaN(mergedAt.getTime()) ||
    typeof raw.number !== 'number' ||
    typeof raw.title !== 'string' ||
    typeof raw.html_url !== 'string' ||
    typeof raw.user?.login !== 'string' ||
    typeof raw.base?.ref !== 'string'
  ) {
    return null;
  }
  return {
    prNumber: raw.number,
    title: raw.title,
    authorLogin: raw.user.login,
    mergedAt,
    htmlUrl: raw.html_url,
    baseBranch: raw.base.ref,
    // GitHub sends null for an empty description.
    body: typeof raw.body === 'string' ? raw.body.slice(0, MAX_BODY_LENGTH) : '',
  };
}
