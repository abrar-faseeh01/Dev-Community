import { ChangelogProvider, MergedPr } from './changelog.provider';

// Used when no GitHub App credentials are configured, and by every automated
// test, so none of them ever reach GitHub.
export class MockChangelogProvider implements ChangelogProvider {
  readonly source = 'mock' as const;

  getLastMergedPr(): Promise<MergedPr | null> {
    return Promise.resolve({
      prNumber: 1,
      title: 'Mock: add changelog page',
      authorLogin: 'mock-user',
      mergedAt: new Date('2026-01-01T00:00:00.000Z'),
      htmlUrl: 'https://github.com/example/example/pull/1',
      baseBranch: 'main',
      body: [
        '## What changed',
        '',
        '- Adds the changelog page',
        '- Syncs the last merged PR from GitHub',
        '',
        '## Testing',
        '',
        '- [x] Unit tests',
        '- [x] Manual check',
      ].join('\n'),
    });
  }
}
