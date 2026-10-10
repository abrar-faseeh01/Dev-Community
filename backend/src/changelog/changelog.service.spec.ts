import { jest } from '@jest/globals';
import type { Model } from 'mongoose';
import {
  ChangelogProvider,
  ChangelogSyncError,
  MergedPr,
} from './changelog.provider';
import { ChangelogService } from './changelog.service';
import type { ChangelogEntry } from './schemas/changelog-entry.schema';

const PR: MergedPr = {
  prNumber: 7,
  title: 'Add things',
  authorLogin: 'octocat',
  mergedAt: new Date('2026-10-01T00:00:00.000Z'),
  htmlUrl: 'https://github.com/octocat/hello/pull/7',
  baseBranch: 'main',
  body: 'Some description',
};

function setup() {
  const getLastMergedPr = jest.fn<ChangelogProvider['getLastMergedPr']>();
  const provider: ChangelogProvider = { source: 'github', getLastMergedPr };
  const exec = jest.fn<() => Promise<unknown>>().mockResolvedValue({ _id: 'x' });
  const findOneAndUpdate = jest.fn().mockReturnValue({ exec });
  const model = { findOneAndUpdate } as unknown as Model<ChangelogEntry>;
  return {
    service: new ChangelogService(model, provider),
    getLastMergedPr,
    findOneAndUpdate,
  };
}

describe('ChangelogService.sync', () => {
  it('upserts by owner, repo and prNumber, with owner and repo lowercased', async () => {
    const { service, getLastMergedPr, findOneAndUpdate } = setup();
    getLastMergedPr.mockResolvedValue(PR);

    await service.sync('OctoCat/Hello');

    expect(getLastMergedPr).toHaveBeenCalledWith('octocat', 'hello');
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
      unknown,
    ];
    expect(filter).toEqual({ owner: 'octocat', repo: 'hello', prNumber: 7 });
    expect(update.$set).toMatchObject({
      owner: 'octocat',
      repo: 'hello',
      title: 'Add things',
    });
    expect(update.$set.syncedAt).toBeInstanceOf(Date);
    expect(options).toMatchObject({ upsert: true });
  });

  it('returns null and writes nothing when no PR was ever merged', async () => {
    const { service, getLastMergedPr, findOneAndUpdate } = setup();
    getLastMergedPr.mockResolvedValue(null);

    await expect(service.sync('octocat/hello')).resolves.toBeNull();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['GITHUB_TIMEOUT', 'GITHUB_RATE_LIMITED'] as const)(
    'rethrows %s as the stable error and never touches the database',
    async (code) => {
      const { service, getLastMergedPr, findOneAndUpdate } = setup();
      getLastMergedPr.mockRejectedValue(new ChangelogSyncError(code));

      const error = await service.sync('octocat/hello').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ChangelogSyncError);
      expect((error as ChangelogSyncError).getResponse()).toEqual({
        code,
        message: expect.any(String),
      });
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    },
  );
});
