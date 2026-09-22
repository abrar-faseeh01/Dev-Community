import type { INestApplication } from '@nestjs/common';

// These specs talk to the real Atlas database (MONGODB_URI from .env), the
// same as the by-hand testing on Days 7 and 8. Everything they create is a
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

// A full Nest app the way production builds it: AppModule plus the shared
// configureApp() setup (helmet, cookie parser, validation pipe, exception
// filter, response envelope). Only the throttler differs.
//
// AppModule and @nestjs/throttler are imported dynamically, after Nest's own
// (ESM-only) packages have finished loading. @nestjs/throttler v6 is a
// CommonJS package that require()s @nestjs/common; if Jest links both in the
// same pass it fails with "Cannot require() ES Module ... in a cycle". In
// production Node loads them natively and there is no such problem.
export async function createE2eApp(): Promise<INestApplication> {
  const { Test } = await import('@nestjs/testing');
  await import('@nestjs/common');
  const { ThrottlerStorage } = await import('@nestjs/throttler');
  // Explicit .js extensions: TypeScript requires them on a dynamic import()
  // in this module mode. jest-e2e.json maps them back to the .ts files.
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/configure-app.js');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ThrottlerStorage)
    .useValue(neverThrottle)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
