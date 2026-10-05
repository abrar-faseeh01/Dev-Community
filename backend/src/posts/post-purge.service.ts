import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Model } from 'mongoose';
import { Comment } from '../comments/schemas/comment.schema';
import { Reaction } from '../reactions/schemas/reaction.schema';
import { Post } from './schemas/post.schema';

export const POST_PURGE_JOB = 'post-purge';
export const PURGE_BATCH_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeResult {
  posts: number;
  comments: number;
  reactions: number;
}

@Injectable()
export class PostPurgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PostPurgeService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Reaction.name) private readonly reactionModel: Model<Reaction>,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.retentionDays = this.config.getOrThrow<number>(
      'POST_PURGE_RETENTION_DAYS',
    );
  }

  // The job is registered here instead of with @Cron(): a decorator's
  // expression is fixed when the class is loaded, before ConfigService can be
  // read. Registering by hand lets the schedule come from the environment.
  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<boolean>('POST_PURGE_ENABLED')) {
      this.logger.log('Post purge job is disabled (POST_PURGE_ENABLED=false)');
      return;
    }

    const cronExpression = this.config.getOrThrow<string>('POST_PURGE_CRON');
    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => this.handleCron(),
      start: false,
      // If a run is still going when the next tick is due, that tick is
      // skipped instead of running a second purge alongside the first.
      waitForCompletion: true,
    });
    this.schedulerRegistry.addCronJob(POST_PURGE_JOB, job);
    job.start();

    this.logger.log(
      `Post purge scheduled "${cronExpression}", retention ${this.retentionDays} days, ` +
        `next run ${job.nextDate().toJSDate().toISOString()}`,
    );
  }

  // Scheduling concerns only: catch, log, never throw. An error that escaped
  // here would be an unhandled rejection inside the timer.
  async handleCron(): Promise<void> {
    try {
      const result = await this.purgeExpiredPosts();
      if (result.posts > 0) {
        this.logger.log(
          `Purged ${result.posts} posts, ${result.comments} comments, ${result.reactions} reactions`,
        );
      } else {
        this.logger.debug('Post purge ran: nothing to purge');
      }
    } catch (error) {
      this.logger.error(
        'Post purge failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // `now` is a parameter so a test can pass a fixed date instead of faking timers.
  async purgeExpiredPosts(now: Date = new Date()): Promise<PurgeResult> {
    const cutoff = new Date(now.getTime() - this.retentionDays * DAY_MS);
    const total: PurgeResult = { posts: 0, comments: 0, reactions: 0 };

    for (;;) {
      // $lte only matches Date values, so live posts (deletedAt: null) are never
      // selected. Served by the {deletedAt, _id} index.
      const expired = await this.postModel
        .find({ deletedAt: { $lte: cutoff } })
        .select('_id')
        .limit(PURGE_BATCH_SIZE)
        .lean();
      if (expired.length === 0) break;
      const postIds = expired.map((post) => post._id);

      // Every comment under these posts, soft-deleted at any time. The post is
      // going, so none of them may be left behind. Served by the
      // {postId, deletedAt, _id} index prefix.
      const comments = await this.commentModel
        .find({ postId: { $in: postIds } })
        .select('_id')
        .lean();
      const commentIds = comments.map((comment) => comment._id);

      // Children first, posts last: a crash part-way leaves the posts still
      // marked deletedAt, so the next run finds them and finishes the job. In
      // the reverse order a crash would orphan rows that nothing ever finds
      // again. Both reaction deletes use the {targetType, targetId} index.
      const postReactions = await this.reactionModel.deleteMany({
        targetType: 'post',
        targetId: { $in: postIds },
      });
      const commentReactions =
        commentIds.length > 0
          ? await this.reactionModel.deleteMany({
              targetType: 'comment',
              targetId: { $in: commentIds },
            })
          : { deletedCount: 0 };
      const deletedComments = await this.commentModel.deleteMany({
        postId: { $in: postIds },
      });
      const deletedPosts = await this.postModel.deleteMany({
        _id: { $in: postIds },
      });

      total.reactions +=
        postReactions.deletedCount + commentReactions.deletedCount;
      total.comments += deletedComments.deletedCount;
      total.posts += deletedPosts.deletedCount;

      // A short batch means nothing is left. Zero posts deleted means something
      // is wrong, so stop rather than loop forever.
      if (
        expired.length < PURGE_BATCH_SIZE ||
        deletedPosts.deletedCount === 0
      ) {
        break;
      }
    }

    return total;
  }
}
