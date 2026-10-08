import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { MAIL_QUEUE, WELCOME_JOB, WelcomeJobData } from './mail.constants';
import { MailService } from './mail.service';

// The worker: takes jobs off the "mail" queue one by one (up to
// MAIL_CONCURRENCY at a time) and runs process() for each. If process()
// throws, BullMQ retries the job using the attempts/backoff it was added with.
// It is a provider of MailModule, so it runs inside the API process: there is
// no separate worker process to start.
@Processor(MAIL_QUEUE)
export class MailProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  // The @Processor decorator is read before the environment is loaded, so the
  // concurrency is applied here instead, once the worker exists.
  onApplicationBootstrap(): void {
    this.worker.concurrency =
      this.config.getOrThrow<number>('MAIL_CONCURRENCY');
  }

  async process(job: Job<WelcomeJobData>): Promise<void> {
    switch (job.name) {
      case WELCOME_JOB:
        return this.handleWelcome(job);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleWelcome(job: Job<WelcomeJobData>): Promise<void> {
    const { userId } = job.data;
    // A malformed id can never succeed, so finish quietly instead of retrying.
    if (!Types.ObjectId.isValid(userId)) return;

    const user = await this.userModel
      .findById(userId)
      .select('email fullName welcomeEmailSentAt');
    // Deleted between signup and now: nothing to send.
    if (!user) return;

    // Idempotency guard: a retried or duplicated job must not email twice.
    if (user.welcomeEmailSentAt) {
      this.logger.log(`Job ${job.id}: welcome email already sent, skipping`);
      return;
    }

    // Throws on failure, which is what makes BullMQ retry.
    await this.mail.sendWelcome(user.email, user.fullName);

    // Only mark as sent if nobody else did in the meantime.
    await this.userModel.updateOne(
      { _id: user._id, welcomeEmailSentAt: null },
      { $set: { welcomeEmailSentAt: new Date() } },
    );
  }

  // The user's email address is deliberately not logged.
  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} completed (attempt ${job.attemptsMade})`);
  }

  // An earlier attempt failing is routine (BullMQ retries it), so it is a
  // warning. The final attempt failing means the email is never sent and
  // nothing retries it later, so it is an error, naming the user by id.
  @OnWorkerEvent('failed')
  onFailed(job: Job<WelcomeJobData> | undefined, error: Error): void {
    const attempts = job?.opts.attempts ?? 1;
    const attempt = `attempt ${job?.attemptsMade}/${attempts}`;
    if (job && job.attemptsMade >= attempts) {
      this.logger.error(
        `Job ${job.id} failed its final ${attempt}, giving up: user ${job.data?.userId} gets no welcome email: ${error.message}`,
      );
      return;
    }
    this.logger.warn(`Job ${job?.id} failed (${attempt}): ${error.message}`);
  }
}
