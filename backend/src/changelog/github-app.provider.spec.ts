import { jest } from '@jest/globals';
import { generateKeyPairSync } from 'node:crypto';
import { ChangelogSyncError } from './changelog.provider';
import { GithubAppProvider } from './github-app.provider';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
// The env var holds the key on one line with literal \n.
const ONE_LINE_KEY = privateKey.replace(/\n/g, '\\n');

const SECRET_TOKEN = 'ghs_SECRET_INSTALLATION_TOKEN';
const SECRET_BODY = 'UPSTREAM_BODY_THAT_MUST_NOT_LEAK';

const provider = () =>
  new GithubAppProvider({
    appId: '123',
    installationId: '456',
    privateKey: ONE_LINE_KEY,
  });

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const pr = (number: number, mergedAt: string | null) => ({
  number,
  title: `PR ${number}`,
  merged_at: mergedAt,
  html_url: `https://github.com/o/r/pull/${number}`,
  user: { login: 'octocat' },
  base: { ref: 'main' },
});

describe('GithubAppProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success', () => {
    it('returns the PR with the latest merged_at, skipping unmerged ones', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ token: SECRET_TOKEN }, { status: 201 }))
        .mockResolvedValueOnce(
          json([
            pr(3, null),
            pr(1, '2026-10-01T00:00:00Z'),
            pr(2, '2026-10-05T00:00:00Z'),
          ]),
        );

      await expect(provider().getLastMergedPr('o', 'r')).resolves.toMatchObject({
        prNumber: 2,
        authorLogin: 'octocat',
        baseBranch: 'main',
        mergedAt: new Date('2026-10-05T00:00:00Z'),
      });
    });

    it('keeps the PR description, turns a null one into "" and caps a huge one', async () => {
      const withBody = (number: number, body: unknown) => ({
        ...pr(number, '2026-10-05T00:00:00Z'),
        body,
      });
      for (const [body, expected] of [
        ['## Notes', '## Notes'],
        [null, ''],
        ['x'.repeat(20000), 'x'.repeat(10000)],
      ] as const) {
        fetchMock
          .mockResolvedValueOnce(json({ token: SECRET_TOKEN }, { status: 201 }))
          .mockResolvedValueOnce(json([withBody(1, body)]));
        await expect(
          provider().getLastMergedPr('o', 'r'),
        ).resolves.toMatchObject({ body: expected });
      }
    });

    it('returns null when nothing was merged', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ token: SECRET_TOKEN }, { status: 201 }))
        .mockResolvedValueOnce(json([pr(3, null)]));
      await expect(provider().getLastMergedPr('o', 'r')).resolves.toBeNull();
    });

    it('shares ONE abort signal across both calls and sends the minted token to the second', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ token: SECRET_TOKEN }, { status: 201 }))
        .mockResolvedValueOnce(json([]));

      await provider().getLastMergedPr('o', 'r');

      const [first, second] = fetchMock.mock.calls.map((c) => c[1]!);
      expect(first.signal).toBeDefined();
      expect(first.signal).toBe(second.signal);
      expect(first.method).toBe('POST');
      expect((second.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${SECRET_TOKEN}`,
      );
      // App JWT: three base64url parts.
      expect(
        (first.headers as Record<string, string>).Authorization,
      ).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    });
  });

  describe('error mapping', () => {
    const tokenOk = () =>
      fetchMock.mockResolvedValueOnce(
        json({ token: SECRET_TOKEN }, { status: 201 }),
      );
    const failing = (status: number, headers: Record<string, string> = {}) =>
      new Response(SECRET_BODY, { status, headers });

    it.each([
      ['pulls', 403, {}, 'GITHUB_FORBIDDEN'],
      ['pulls', 403, { 'x-ratelimit-remaining': '0' }, 'GITHUB_RATE_LIMITED'],
      ['pulls', 429, {}, 'GITHUB_RATE_LIMITED'],
      ['pulls', 404, {}, 'REPO_NOT_FOUND'],
      ['pulls', 401, {}, 'GITHUB_AUTH_FAILED'],
      ['pulls', 500, {}, 'GITHUB_UNAVAILABLE'],
      ['pulls', 503, {}, 'GITHUB_UNAVAILABLE'],
      ['token', 401, {}, 'GITHUB_AUTH_FAILED'],
      ['token', 404, {}, 'GITHUB_AUTH_FAILED'],
      ['token', 403, {}, 'GITHUB_FORBIDDEN'],
    ] as const)(
      'maps a %s-stage %i %j to %s',
      async (stage, status, headers, code) => {
        if (stage === 'pulls') tokenOk();
        fetchMock.mockResolvedValueOnce(failing(status, { ...headers }));

        const error = await provider()
          .getLastMergedPr('o', 'r')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ChangelogSyncError);
        expect((error as ChangelogSyncError).code).toBe(code);
      },
    );

    it('maps the shared deadline firing to GITHUB_TIMEOUT', async () => {
      fetchMock.mockRejectedValueOnce(
        new DOMException('The operation timed out.', 'TimeoutError'),
      );
      await expect(provider().getLastMergedPr('o', 'r')).rejects.toMatchObject({
        code: 'GITHUB_TIMEOUT',
      });
    });

    it('maps a network failure to GITHUB_UNAVAILABLE', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(provider().getLastMergedPr('o', 'r')).rejects.toMatchObject({
        code: 'GITHUB_UNAVAILABLE',
      });
    });

    it('maps an unusable private key to GITHUB_AUTH_FAILED without calling GitHub', async () => {
      const bad = new GithubAppProvider({
        appId: '1',
        installationId: '2',
        privateKey: 'not a key',
      });
      await expect(bad.getLastMergedPr('o', 'r')).rejects.toMatchObject({
        code: 'GITHUB_AUTH_FAILED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never puts a token, key or upstream body in the error', async () => {
      tokenOk();
      fetchMock.mockResolvedValueOnce(failing(500));

      const error = (await provider()
        .getLastMergedPr('o', 'r')
        .catch((e: unknown) => e)) as ChangelogSyncError;

      const text = JSON.stringify(error.getResponse()) + error.message;
      expect(text).not.toContain(SECRET_TOKEN);
      expect(text).not.toContain(SECRET_BODY);
      expect(text).not.toContain('PRIVATE KEY');
    });
  });
});
