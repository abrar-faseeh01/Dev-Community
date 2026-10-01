import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  PORT: z.string().default('3000'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:3001'),
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
});

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
