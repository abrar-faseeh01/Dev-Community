import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { CHANGELOG_PROVIDER } from '../src/changelog/changelog.provider';
import type { ChangelogProvider } from '../src/changelog/changelog.provider';
import { ChangelogSyncError } from '../src/changelog/changelog.provider';
import { ChangelogEntry } from '../src/changelog/schemas/changelog-entry.schema';
import { jest } from '@jest/globals';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// createE2eApp() forces the mock provider, so no test here reaches GitHub.
// The mock's fixed PR is #1; failures are injected by spying on the provider.
describeE2e('Changelog', () => {
  let app: INestApplication;
  let data: E2eData;
  let admin: E2eUser;
  let reader: E2eUser;
  let model: Model<ChangelogEntry>;
  let provider: ChangelogProvider;

  // A throwaway owner, so cleanup deletes only rows this run created.
  let owner: string;
  const repoPath = () => `${owner}/demo`;

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();
    admin = await data.createUser('admin');
    reader = await data.createUser('user');
    model = app.get(getModelToken(ChangelogEntry.name), { strict: false });
    provider = app.get<ChangelogProvider>(CHANGELOG_PROVIDER);
    owner = `e2e-changelog-${data.runId}`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await model.deleteMany({ owner });
  });

  afterAll(async () => {
    try {
      await model?.deleteMany({ owner });
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  const http = () => request(app.getHttpServer());
  const sync = (cookie: string | undefined, repo: unknown) => {
    const req = http().post('/changelog/sync').send({ repo });
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('fails soft: a timeout or rate limit returns the stable error and leaves the stored entry unchanged', async () => {
    const stored = await model.create({
      owner,
      repo: 'demo',
      prNumber: 1,
      title: 'Stored title',
      authorLogin: 'someone',
      mergedAt: new Date('2026-01-01T00:00:00Z'),
      htmlUrl: 'https://github.com/x/y/pull/1',
      baseBranch: 'main',
      syncedAt: new Date('2026-01-02T00:00:00Z'),
    });
    const before = (await model.findById(stored._id).lean())!;

    for (const [code, status] of [
      ['GITHUB_TIMEOUT', 504],
      ['GITHUB_RATE_LIMITED', 503],
    ] as const) {
      jest
        .spyOn(provider, 'getLastMergedPr')
        .mockRejectedValueOnce(new ChangelogSyncError(code));

      const res = await sync(admin.cookie, repoPath()).expect(status);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toEqual(expect.any(String));
    }

    expect(await model.countDocuments({ owner })).toBe(1);
    expect(await model.findById(stored._id).lean()).toEqual(before);

    // And reads still serve the stored entry.
    const list = await http().get('/changelog').set('Cookie', reader.cookie);
    expect(list.status).toBe(200);
    expect(
      list.body.data.some((e: { title: string }) => e.title === 'Stored title'),
    ).toBe(true);
  });

  it('syncing twice leaves one document', async () => {
    await sync(admin.cookie, repoPath()).expect(200);
    await sync(admin.cookie, repoPath().toUpperCase()).expect(200);
    expect(await model.countDocuments({ owner })).toBe(1);
  });

  it('GET /changelog never calls the provider', async () => {
    const spy = jest.spyOn(provider, 'getLastMergedPr');
    await http().get('/changelog').set('Cookie', reader.cookie).expect(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('is admin only and needs a session', async () => {
    await sync(undefined, repoPath()).expect(401);
    await sync(reader.cookie, repoPath()).expect(403);
    await http().get('/changelog').expect(401);
  });

  it.each(['', 'nope', 'a/b/c', 'a/..', '/repo', 'owner/', 'ow ner/repo', 42])(
    'rejects repo %j with 400',
    async (repo) => {
      await sync(admin.cookie, repo).expect(400);
    },
  );
});
