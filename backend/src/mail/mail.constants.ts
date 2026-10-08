import type { JobsOptions } from 'bullmq';

export const MAIL_QUEUE = 'mail';
export const WELCOME_JOB = 'welcome-email';

// Only the id travels through Redis: the worker loads the user itself, so the
// job never carries stale data or personal details.
export interface WelcomeJobData {
  userId: string;
}

// Every welcome job is added with these options (by signup, and by the test
// script), so they live in one place.
export function welcomeJobOptions(userId: string): JobsOptions {
  return {
    // One job per user: adding the same id again while it exists is ignored.
    // BullMQ rejects ids containing ":", hence the dash.
    jobId: `welcome-${userId}`,
    attempts: 5, // the first try plus 4 retries
    backoff: { type: 'exponential', delay: 2000 }, // waits 2s, 4s, 8s, 16s
    // Without these Redis keeps every finished job forever.
    removeOnComplete: { age: 60 * 60, count: 1000 },
    removeOnFail: { age: 24 * 60 * 60 },
  };
}
