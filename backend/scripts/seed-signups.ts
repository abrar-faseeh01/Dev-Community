import 'dotenv/config';
import mongoose from 'mongoose';

// Fires a burst of signups at the running API and reports how long they took,
// then (if Mailpit is reachable) how long the welcome emails took to arrive
// and whether any user got more than one.
//
//   npm run seed:signups                       100 signups, 10 at a time
//   npm run seed:signups -- --total=50 --concurrency=5
//   npm run seed:signups -- --cleanup          delete the users it created
//
// The API must be running with THROTTLE_DISABLED=true, otherwise signup's limit
// of 5 a minute answers most of the burst with 429. Start the API with the
// settings you want to test (MAIL_MODE, MAIL_DELAY_MS, MAIL_FAILURE_RATE,
// MAIL_CONCURRENCY): this script only measures, it does not change them.

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value] = arg.slice(2).split('=');
      return [key, value ?? 'true'] as const;
    }),
);

function numberArg(name: string, fallback: number): number {
  const value = Number(args.get(name) ?? fallback);
  if (!Number.isFinite(value) || value < 1) {
    console.error(`--${name} must be a number of at least 1`);
    process.exit(1);
  }
  return value;
}

const TOTAL = numberArg('total', 100);
const CONCURRENCY = numberArg('concurrency', 10);
const WAIT_SECONDS = numberArg('wait', 120); // how long to wait for the emails
const API_URL =
  process.env.API_URL ?? `http://localhost:${process.env.PORT || 3000}`;
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

// Every user this script creates matches this, which is what --cleanup deletes.
const EMAIL_PATTERN = /^load-\d+-\d+@example\.com$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const result = await mongoose.connection
    .collection('users')
    .deleteMany({ email: { $regex: EMAIL_PATTERN.source } });
  console.log(`Deleted ${result.deletedCount} load-test users.`);
  await mongoose.disconnect();
}

// ---- Mailpit (fake inbox) -------------------------------------------------

async function mailpit(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${MAILPIT_URL}${path}`, init);
  if (!res.ok) throw new Error(`Mailpit answered ${res.status} for ${path}`);
  return res.json().catch(() => ({}));
}

const listOf = (data: any): any[] => data?.messages ?? data?.Messages ?? [];

async function mailpitTotal(): Promise<number> {
  const data = await mailpit('/api/v1/messages?limit=1');
  return Number(data.total ?? data.messages_count ?? data.count ?? 0);
}

async function mailpitRecipients(): Promise<string[]> {
  const recipients: string[] = [];
  for (let start = 0; ;) {
    const page = listOf(
      await mailpit(`/api/v1/messages?start=${start}&limit=100`),
    );
    if (page.length === 0) break;
    for (const message of page) {
      const to = message.To?.[0] ?? message.to?.[0];
      recipients.push(String(to?.Address ?? to?.address ?? '').toLowerCase());
    }
    start += page.length;
  }
  return recipients;
}

// ---- Signups --------------------------------------------------------------

interface Outcome {
  email: string;
  status: number | 'network error';
  ms: number;
}

async function signup(runId: number, index: number): Promise<Outcome> {
  const email = `load-${runId}-${index}@example.com`;
  const started = performance.now();
  try {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: `Load User ${index}`,
        email,
        password: 'Passw0rd!123',
      }),
    });
    await res.arrayBuffer(); // read the body so the timing includes all of it
    return { email, status: res.status, ms: performance.now() - started };
  } catch {
    return { email, status: 'network error', ms: performance.now() - started };
  }
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];

async function main() {
  if (args.has('cleanup')) return cleanup();

  const runId = Date.now();
  console.log(`API ${API_URL}: ${TOTAL} signups, ${CONCURRENCY} at a time\n`);

  // Start from an empty inbox so the email counts below are only this run's.
  let inboxAvailable = true;
  try {
    await mailpit('/api/v1/messages', { method: 'DELETE' });
  } catch {
    inboxAvailable = false;
    console.log(
      `(Mailpit not reachable at ${MAILPIT_URL}: skipping the email checks)\n`,
    );
  }

  const outcomes: Outcome[] = [];
  let next = 0;
  const startedAt = Date.now();
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < TOTAL) outcomes.push(await signup(runId, next++));
    }),
  );
  const signupSeconds = (performance.now() - t0) / 1000;

  const created = outcomes.filter((o) => o.status === 201);
  const times = created.map((o) => o.ms).sort((a, b) => a - b);
  const failures = new Map<string, number>();
  for (const o of outcomes.filter((o) => o.status !== 201)) {
    failures.set(String(o.status), (failures.get(String(o.status)) ?? 0) + 1);
  }

  console.log('SIGNUPS');
  console.table({
    sent: TOTAL,
    created: created.length,
    failed: TOTAL - created.length,
    'total time (s)': Number(signupSeconds.toFixed(1)),
    'p50 (ms)': times.length ? Math.round(percentile(times, 0.5)) : '-',
    'p95 (ms)': times.length ? Math.round(percentile(times, 0.95)) : '-',
    'max (ms)': times.length ? Math.round(times[times.length - 1]) : '-',
  });
  if (failures.size > 0) {
    console.log('Failed by status:', Object.fromEntries(failures));
    if (failures.has('429')) {
      console.log(
        '429 means rate limiting is on: start the API with THROTTLE_DISABLED=true.',
      );
    }
  }

  if (!inboxAvailable || created.length === 0) return;

  // Wait for the worker to finish: every created user should get one email.
  console.log(
    `\nWaiting up to ${WAIT_SECONDS}s for ${created.length} emails...`,
  );
  let delivered = 0;
  let allArrivedMs: number | undefined;
  while (Date.now() - startedAt < WAIT_SECONDS * 1000) {
    delivered = await mailpitTotal();
    if (delivered >= created.length) {
      allArrivedMs = Date.now() - startedAt;
      break;
    }
    await sleep(250);
  }

  const recipients = await mailpitRecipients();
  const perUser = new Map<string, number>();
  for (const address of recipients) {
    perUser.set(address, (perUser.get(address) ?? 0) + 1);
  }
  const duplicates = [...perUser.values()].filter((n) => n > 1).length;
  const missing = created.filter((o) => !perUser.has(o.email)).length;

  console.log('\nEMAILS');
  console.table({
    expected: created.length,
    'in the inbox': recipients.length,
    'users with a duplicate': duplicates,
    'users with no email': missing,
    'all arrived after (s)':
      allArrivedMs === undefined
        ? 'not within the wait'
        : Number((allArrivedMs / 1000).toFixed(1)),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => undefined));
