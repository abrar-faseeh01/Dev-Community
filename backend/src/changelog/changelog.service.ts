import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CHANGELOG_PROVIDER } from './changelog.provider';
import type { ChangelogProvider } from './changelog.provider';
import { ChangelogEntry } from './schemas/changelog-entry.schema';

const LIST_LIMIT = 50;

@Injectable()
export class ChangelogService {
  constructor(
    @InjectModel(ChangelogEntry.name)
    private readonly model: Model<ChangelogEntry>,
    @Inject(CHANGELOG_PROVIDER) private readonly provider: ChangelogProvider,
  ) {}

  // Mongo only; never calls GitHub.
  findAll() {
    return this.model.find().sort({ mergedAt: -1 }).limit(LIST_LIMIT).exec();
  }

  /**
   * Fetches the last merged PR and upserts it. The provider is awaited before
   * the database is touched, so when it throws (ChangelogSyncError) nothing
   * has been written and every stored row is exactly as it was.
   */
  async sync(repoPath: string) {
    const [owner, repo] = repoPath.toLowerCase().split('/');
    const pr = await this.provider.getLastMergedPr(owner, repo);
    if (!pr) return null;

    return this.model
      .findOneAndUpdate(
        { owner, repo, prNumber: pr.prNumber },
        { $set: { ...pr, owner, repo, syncedAt: new Date() } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
  }
}
