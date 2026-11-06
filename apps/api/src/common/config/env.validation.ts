import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/v1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }).min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(20),
  DATABASE_SSL: z.coerce.boolean().default(false),

  // Auth / Supabase
  SUPABASE_URL: z.string().url().default('https://mock.supabase.co'),
  SUPABASE_JWT_SECRET: z.string({ required_error: 'SUPABASE_JWT_SECRET is required' }).min(16, 'SUPABASE_JWT_SECRET must be at least 16 characters'),

  // Razorpay Test Gateway
  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret_placeholder'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_test_webhook_secret'),

  // Outbox & Idempotency
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().default(86400),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

const SENSITIVE_KEYS = new Set([
  'DATABASE_URL',
  'SUPABASE_JWT_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
]);

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);

  if (!result.success) {
    // Sanitize issues so secrets or raw config values are never leaked in logs
    const sanitizedIssues = result.error.issues.map((issue) => {
      const pathKey = issue.path.join('.');
      return {
        field: pathKey,
        code: issue.code,
        message: issue.message,
        // Ensure no sensitive content is shown
        sensitive: SENSITIVE_KEYS.has(pathKey),
      };
    });

    const errorDetails = JSON.stringify(sanitizedIssues, null, 2);
    throw new Error(`[Configuration Error] Environment validation failed:\n${errorDetails}`);
  }

  return result.data;
}
