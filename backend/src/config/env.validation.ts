import { validateCronExpression } from 'cron';
import { z } from 'zod';
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// z.coerce.boolean() would turn the string "false" into true, so the two
// strings are listed out.
const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3001';

// An http(s) origin written exactly as a browser sends it in the Origin header.
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      blankToUndefined,
      z.enum(['development', 'production', 'test']).default('development'),
    ),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),

    // The access token is short-lived on purpose: the refresh token below is
    // what keeps a session going, so a stolen access token is useful briefly.
    JWT_EXPIRES_IN: z.preprocess(blankToUndefined, z.string().default('15m')),

    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_REFRESH_EXPIRES_IN: z.preprocess(
      blankToUndefined,
      z.string().default('7d'),
    ),

    // Left unset it follows NODE_ENV (secure in production); see the transform
    // below. Setting it to false in production is rejected.
    COOKIE_SECURE: z.preprocess(blankToUndefined, booleanString.optional()),

    // Where the browser sends the refresh cookie. It must cover the refresh
    // route, so it moves with any prefix the API is later mounted under.
    COOKIE_REFRESH_PATH: z.preprocess(
      blankToUndefined,
      z
        .string()
        .startsWith('/', 'COOKIE_REFRESH_PATH must start with /')
        .default('/auth'),
    ),

    PORT: z.string().default('3000'),

    // The one origin CORS allows (with credentials). Must be an exact origin:
    // "*" would never work with cookies, and a trailing slash would never equal
    // the Origin header a browser sends, so either would silently block the
    // frontend. Left unset it falls back to the local frontend (transform
    // below), but not in production, where a forgotten value would otherwise
    // go unnoticed until the real frontend fails.
    FRONTEND_ORIGIN: z.preprocess(
      blankToUndefined,
      z
        .string()
        .refine(isOrigin, {
          message:
            'FRONTEND_ORIGIN must be one exact origin such as https://app.example.com (scheme and host, no path, no trailing slash, no wildcard)',
        })
        .optional(),
    ),
    SUMMARIZER_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['mock', 'gemini']).optional(),
    ),

    SUMMARIZER_API_KEY: z.preprocess(
      blankToUndefined,
      z.string().trim().optional(),
    ),

    SUMMARIZER_MODEL: z.preprocess(
      blankToUndefined,
      z.string().trim().default('gemini-3.5-flash-lite'),
    ),

    SUMMARIZER_TIMEOUT_MS: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1000).max(15000).default(10000),
    ),
    // Outgoing mail. Locally this points at Mailpit (a fake SMTP server);
    // nothing here ever reaches a real inbox.
    SMTP_HOST: z.preprocess(
      blankToUndefined,
      z.string().trim().default('localhost'),
    ),
    SMTP_PORT: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1).max(65535).default(1025),
    ),
    MAIL_FROM: z.preprocess(
      blankToUndefined,
      z.string().trim().default('DevCommunity <no-reply@devcommunity.local>'),
    ),
    // Experiment switches (queue demo): make the mail step slow or flaky on
    // purpose. Refused in production below.
    MAIL_FAILURE_RATE: z.preprocess(
      blankToUndefined,
      z.coerce.number().min(0).max(1).default(0),
    ),
    MAIL_DELAY_MS: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(0).max(10000).default(0),
    ),

    // Hard-delete of posts that were soft-deleted long enough ago (Day 19).
    POST_PURGE_ENABLED: z.preprocess(
      blankToUndefined,
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),

    POST_PURGE_RETENTION_DAYS: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1).max(365).default(7),
    ),

    // Checked at startup, so a typo fails the boot instead of silently never
    // running. 5 or 6 fields (a leading seconds field is allowed).
    POST_PURGE_CRON: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .default('0 3 * * *')
        .refine(
          (expression) => validateCronExpression(expression).valid,
          'POST_PURGE_CRON is not a valid cron expression',
        ),
    ),
  })
  // With one secret for both, an access token would verify as a refresh token
  // (and the other way round), which the `type` claim alone should not carry.
  .refine((env) => env.JWT_REFRESH_SECRET !== env.JWT_SECRET, {
    message: 'JWT_REFRESH_SECRET must differ from JWT_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine(
    (env) => !(env.NODE_ENV === 'production' && env.COOKIE_SECURE === false),
    {
      message: 'COOKIE_SECURE=false is not allowed when NODE_ENV=production',
      path: ['COOKIE_SECURE'],
    },
  )
  .refine(
    (env) =>
      !(env.NODE_ENV === 'production' && env.FRONTEND_ORIGIN === undefined),
    {
      message: 'FRONTEND_ORIGIN must be set when NODE_ENV=production',
      path: ['FRONTEND_ORIGIN'],
    },
  )
  .refine(
    (env) =>
      !(
        env.NODE_ENV === 'production' &&
        (env.MAIL_FAILURE_RATE > 0 || env.MAIL_DELAY_MS > 0)
      ),
    {
      message:
        'MAIL_FAILURE_RATE and MAIL_DELAY_MS are test switches and must be 0 when NODE_ENV=production',
      path: ['MAIL_FAILURE_RATE'],
    },
  )

  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
  }));

export function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error(
      '❌ Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}
