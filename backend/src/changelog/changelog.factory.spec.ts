import { jest } from '@jest/globals';
import { createChangelogProvider } from './changelog.factory';

const logger = { log: jest.fn(), warn: jest.fn() };
const FULL = { appId: '1', installationId: '2', privateKey: 'KEY' };

describe('createChangelogProvider', () => {
  it('uses the GitHub App when all three credentials are set', () => {
    expect(createChangelogProvider(FULL, logger).source).toBe('github');
  });

  it.each(['appId', 'installationId', 'privateKey'] as const)(
    'falls back to the mock when %s is missing',
    (field) => {
      expect(
        createChangelogProvider({ ...FULL, [field]: undefined }, logger).source,
      ).toBe('mock');
    },
  );

  it('treats a blank credential as missing', () => {
    expect(
      createChangelogProvider({ ...FULL, privateKey: '   ' }, logger).source,
    ).toBe('mock');
  });

  it('uses the mock when CHANGELOG_PROVIDER=mock, even with credentials', () => {
    expect(
      createChangelogProvider({ ...FULL, provider: 'mock' }, logger).source,
    ).toBe('mock');
  });
});
