import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';

// These specs talk to a real MongoDB database (MONGODB_URI, from .env or the
// environment; Atlas and the Compose Mongo both work), the same as the by-hand
// testing on Days 7 and 8. Everything they create is a
// throwaway row that is cleaned up by id (see e2e-data.ts), but a committed
// suite can be run unattended later, so it is opt-in: without RUN_E2E=1 the
// specs are skipped, and skipped is reported as skipped rather than passed.
export const E2E_ENABLED = process.env.RUN_E2E === '1';

export const describeE2e = E2E_ENABLED ? describe : describe.skip;

// Written to stderr directly: Jest's console capture drops console output for
// a file whose tests are all skipped, which is exactly this case.
if (!E2E_ENABLED) {
  process.stderr.write(
    '\n[e2e] SKIPPED: these specs run against the real database from MONGODB_URI. ' +
      'Set RUN_E2E=1 to run them (nothing was run, so this is not a pass).\n\n',
  );
}

// The global ThrottlerGuard is registered through APP_GUARD, so it cannot be
// overridden by class. Replacing the storage it counts hits in with one that
// never counts anything turns every limit off (including the 5-a-minute
// limit on login) without touching the guard itself.
const neverThrottle = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 0,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

// Stands in for the "mail" BullMQ queue: records what signup adds and never
// touches Redis. Bull Board wraps the same object (its adapter accepts any
// queue whose metaValues.version starts with "bullmq", and at startup reads
// only the name and opts).
export class FakeMailQueue {
  readonly name = 'mail';
  readonly opts = {};
  readonly metaValues = { version: 'bullmq-e2e-fake' };
  readonly jobs: { name: string; data: unknown; opts: unknown }[] = [];

  async add(name: string, data: unknown, opts?: unknown) {
    this.jobs.push({ name, data, opts });
    return { id: `fake-${this.jobs.length}`, name, data };
  }

  async close() {}
}

// Stands in for MailService, so nothing in a test app can send real mail.
export class FakeMailService {
  readonly sent: { to: string; fullName: string }[] = [];

  async sendWelcome(to: string, fullName: string) {
    this.sent.push({ to, fullName });
  }
}

const mailFakes = new WeakMap<
  INestApplication,
  { queue: FakeMailQueue; mail: FakeMailService }
>();

// The fakes an app from createE2eApp() was built with.
export function mailFakesOf(app: INestApplication) {
  const fakes = mailFakes.get(app);
  if (!fakes) throw new Error('app was not built by createE2eApp()');
  return fakes;
}

export type E2eAppOptions = {
  // Keep the real rate limits. Off by default, because every other spec fires
  // far more than 5 logins a minute. Only the rate-limit spec turns it on, and
  // it gets its own app: the counters live in the app's own in-memory storage,
  // so they are gone when that app closes and cannot leak into another spec.
  realThrottler?: boolean;
};

// A full Nest app the way production builds it: AppModule plus the shared
// configureApp() setup (helmet, cookie parser, body parsing, validation pipe,
// exception filter, response envelope). Only the throttler differs, unless
// realThrottler is set.
//
// AppModule and @nestjs/throttler are imported dynamically, after Nest's own
// (ESM-only) packages have finished loading. @nestjs/throttler v6 is a
// CommonJS package that require()s @nestjs/common; if Jest links both in the
// same pass it fails with "Cannot require() ES Module ... in a cycle". In
// production Node loads them natively and there is no such problem.
export async function createE2eApp(
  options: E2eAppOptions = {},
): Promise<INestApplication> {
  // The summarizer must never call the real Gemini API from a test, even when
  // backend/.env holds a real SUMMARIZER_API_KEY (that would spend the shared
  // daily quota). ConfigModule.forRoot() runs when AppModule is first
  // imported and takes a one-time snapshot of .env merged with process.env,
  // with process.env winning, so these two lines must stay ABOVE the
  // AppModule import below. The provider override further down does not
  // depend on that ordering, so the mock is forced even if it ever breaks.
  process.env.SUMMARIZER_PROVIDER = 'mock';
  process.env.SUMMARIZER_API_KEY = '';
  // Same ordering rule: the purge job must never run inside a test app.
  process.env.POST_PURGE_ENABLED = 'false';
  // Same ordering rule: signup must take the queue path (recorded by the fake
  // queue below), even if MAIL_MODE=sync is left in the shell.
  process.env.MAIL_MODE = 'queue';

  const { Test } = await import('@nestjs/testing');
  await import('@nestjs/common');
  // Same reason as @nestjs/throttler above: @bull-board/nestjs (CommonJS,
  // pulled in by MailModule) require()s the ESM-only @nestjs/bull-shared, so
  // it must be loaded here first, which importing @nestjs/bullmq does.
  const { getQueueToken } = await import('@nestjs/bullmq');
  const { ThrottlerStorage } = await import('@nestjs/throttler');
  // Explicit .js extensions: TypeScript requires them on a dynamic import()
  // in this module mode. jest-e2e.json maps them back to the .ts files.
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/configure-app.js');
  const { SUMMARIZER } =
    await import('../../src/summarizer/summarizer.interface.js');
  const { MockSummarizer } =
    await import('../../src/summarizer/mock-summarizer.js');
  const { MAIL_QUEUE } = await import('../../src/mail/mail.constants.js');
  const { MailProcessor } = await import('../../src/mail/mail.processor.js');
  const { MailService } = await import('../../src/mail/mail.service.js');

  // A test app must never use the developer's Redis or send real mail: the
  // queue is replaced by a recorder, and MailService by one that sends
  // nothing. MailProcessor is replaced by a plain object: the BullMQ explorer
  // only starts a worker for a provider whose class carries @Processor, and
  // the class of {} is Object, so no worker (and no Redis connection) exists.
  const fakeQueue = new FakeMailQueue();
  const fakeMail = new FakeMailService();

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!options.realThrottler) {
    builder = builder
      .overrideProvider(ThrottlerStorage)
      .useValue(neverThrottle);
  }
  const moduleRef = await builder
    .overrideProvider(SUMMARIZER)
    .useValue(new MockSummarizer())
    .overrideProvider(getQueueToken(MAIL_QUEUE))
    .useValue(fakeQueue)
    .overrideProvider(MailService)
    .useValue(fakeMail)
    .overrideProvider(MailProcessor)
    .useValue({})
    .compile();

  const app = moduleRef.createNestApplication();
  mailFakes.set(app, { queue: fakeQueue, mail: fakeMail });
  configureApp(app);
  await app.init();

  // Mongoose builds every model's indexes in the background once connected, and
  // the driver opens pooled connections to do it. A very short spec (a few
  // seconds, with no database work of its own) can finish and close while that
  // is still going, and a connection handshake that completes after Jest has
  // torn the environment down fails the whole run ("You are trying to `require`
  // a file after the Jest environment has been torn down", exit code 1 with
  // every test passing). Waiting for the models to finish initializing first
  // means that startup work is over before any test starts.
  const { getConnectionToken } = await import('@nestjs/mongoose');
  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(
    connection.modelNames().map((name) => connection.model(name).init()),
  );

  return app;
}
