import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { WELCOME_JOB, WelcomeJobData } from './mail.constants';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

// The user model and MailService are plain stubs passed to the constructor
// (Jest's ESM mode cannot mock modules). What these cannot show: real BullMQ
// retry and stalled-job behaviour, and the real atomic update in MongoDB.
// Those were checked by hand against Redis and Mongo (crash and idempotency
// tests).

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

const USER_ID = new Types.ObjectId().toHexString();

function makeJob(
  overrides: Partial<{
    name: string;
    data: WelcomeJobData;
    attemptsMade: number;
    attempts: number;
  }> = {},
): Job<WelcomeJobData> {
  return {
    id: `welcome-${USER_ID}`,
    name: overrides.name ?? WELCOME_JOB,
    data: overrides.data ?? { userId: USER_ID },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 5 },
  } as unknown as Job<WelcomeJobData>;
}

describe('MailProcessor', () => {
  const sendWelcome = jest.fn<AsyncFn>();
  const updateOne = jest.fn<AsyncFn>();
  const select = jest.fn<AsyncFn>();
  const findById = jest.fn(() => ({ select }));

  const userModel = { findById, updateOne } as unknown as Model<User>;
  const mail = { sendWelcome } as unknown as MailService;
  const config = {
    getOrThrow: () => 7,
  } as unknown as ConfigService;

  let processor: MailProcessor;
  let logSpy: ReturnType<typeof jest.spyOn>;
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    sendWelcome.mockResolvedValue(undefined);
    updateOne.mockResolvedValue({ modifiedCount: 1 });
    select.mockResolvedValue({
      _id: USER_ID,
      email: 'ada@x.test',
      fullName: 'Ada Lovelace',
      welcomeEmailSentAt: null,
    });
    processor = new MailProcessor(userModel, mail, config);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('process (welcome email)', () => {
    it('sends the email and then marks the user as sent', async () => {
      await processor.process(makeJob());

      expect(findById).toHaveBeenCalledWith(USER_ID);
      expect(sendWelcome).toHaveBeenCalledWith('ada@x.test', 'Ada Lovelace');
      // Only marks a user nobody marked in the meantime.
      expect(updateOne).toHaveBeenCalledWith(
        { _id: USER_ID, welcomeEmailSentAt: null },
        { $set: { welcomeEmailSentAt: expect.any(Date) } },
      );
      expect(sendWelcome.mock.invocationCallOrder[0]).toBeLessThan(
        updateOne.mock.invocationCallOrder[0],
      );
    });

    it('skips a user who already got the email, sending nothing', async () => {
      select.mockResolvedValue({
        _id: USER_ID,
        email: 'ada@x.test',
        fullName: 'Ada Lovelace',
        welcomeEmailSentAt: new Date(),
      });

      await processor.process(makeJob());

      expect(sendWelcome).not.toHaveBeenCalled();
      expect(updateOne).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('already sent, skipping'),
      );
    });

    it('rethrows a send failure (so BullMQ retries) and does not mark the user', async () => {
      sendWelcome.mockRejectedValue(new Error('SMTP down'));

      await expect(processor.process(makeJob())).rejects.toThrow('SMTP down');
      expect(updateOne).not.toHaveBeenCalled();
    });

    it('finishes quietly for a malformed user id, without touching the database', async () => {
      await expect(
        processor.process(makeJob({ data: { userId: 'not-an-id' } })),
      ).resolves.toBeUndefined();

      expect(findById).not.toHaveBeenCalled();
      expect(sendWelcome).not.toHaveBeenCalled();
    });

    it('finishes quietly when the user no longer exists', async () => {
      select.mockResolvedValue(null);

      await expect(processor.process(makeJob())).resolves.toBeUndefined();
      expect(sendWelcome).not.toHaveBeenCalled();
      expect(updateOne).not.toHaveBeenCalled();
    });

    it('rejects a job name it does not know', async () => {
      await expect(
        processor.process(makeJob({ name: 'something-else' })),
      ).rejects.toThrow('Unknown job name: something-else');
      expect(sendWelcome).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('logs an earlier failed attempt as a warning', () => {
      processor.onFailed(makeJob({ attemptsMade: 2 }), new Error('boom'));

      expect(warnSpy).toHaveBeenCalledWith(
        `Job welcome-${USER_ID} failed (attempt 2/5): boom`,
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs the final failed attempt as an error naming the user id, not the address', () => {
      processor.onFailed(makeJob({ attemptsMade: 5 }), new Error('boom'));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = String(errorSpy.mock.calls[0][0]);
      expect(message).toContain('final attempt 5/5');
      expect(message).toContain(`user ${USER_ID}`);
      expect(message).toContain('boom');
      expect(message).not.toContain('@');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still logs (as a warning) when BullMQ passes no job', () => {
      processor.onFailed(undefined, new Error('boom'));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed (attempt undefined/1): boom'),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  it('applies MAIL_CONCURRENCY to the worker once the app boots', () => {
    const worker = { concurrency: 1 };
    Object.defineProperty(processor, 'worker', { get: () => worker });

    processor.onApplicationBootstrap();

    expect(worker.concurrency).toBe(7);
  });
});
