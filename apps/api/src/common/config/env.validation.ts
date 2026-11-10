import { z } from 'zod';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    API_PREFIX: z.string().default(''),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // CORS Configuration
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

    // Database Connectivity
    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MIN: z.coerce.number().default(2),
    DATABASE_POOL_MAX: z.coerce.number().default(20),
    DATABASE_SSL: z.coerce.boolean().default(false),

    // Identity & Supabase Auth
    SUPABASE_URL: z.string().url().default('https://mock.supabase.co'),
    SUPABASE_JWT_SECRET: z
      .string({ required_error: 'SUPABASE_JWT_SECRET is required' })
      .min(16, 'SUPABASE_JWT_SECRET must be at least 16 characters'),

    // Provider Modes & Adapters
    PAYMENT_PROVIDER_MODE: z
      .enum(['razorpay_test', 'razorpay_live', 'mock'])
      .default('razorpay_test'),
    OTP_PROVIDER_MODE: z.enum(['twilio', 'sns', 'mock']).default('mock'),
    JOB_RUNNER_MODE: z.enum(['bullmq_redis', 'in_memory', 'mock']).default('in_memory'),

    // Redis
    REDIS_URL: z.string().optional(),

    // Razorpay Gateway Credentials
    RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
    RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret_placeholder'),
    RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_test_webhook_secret'),

    // Outbox & Idempotency Controls
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(5000),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().default(86400),

    // Graceful Shutdown Budget
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10000),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // 1. Database URL cannot point to localhost in production mode
      if (
        data.DATABASE_URL.includes('localhost') ||
        data.DATABASE_URL.includes('127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL cannot use localhost in production mode',
        });
      }

      // 2. Supabase cannot point to mock service in production
      if (
        data.SUPABASE_URL.includes('mock') ||
        data.SUPABASE_URL.includes('localhost')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: 'SUPABASE_URL cannot point to mock service in production mode',
        });
      }

      // 3. JWT secret must be at least 32 characters and non-default in production
      if (
        data.SUPABASE_JWT_SECRET.length < 32 ||
        data.SUPABASE_JWT_SECRET.includes('mock') ||
        data.SUPABASE_JWT_SECRET.includes('development')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_JWT_SECRET'],
          message:
            'SUPABASE_JWT_SECRET must be at least 32 characters and cannot use default/mock secret in production',
        });
      }

      // 4. Payment provider mode cannot be mock in production
      if (data.PAYMENT_PROVIDER_MODE === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_PROVIDER_MODE'],
          message: 'PAYMENT_PROVIDER_MODE cannot be mock in production mode',
        });
      }

      // 5. Razorpay credentials cannot use placeholder values in production
      if (
        data.RAZORPAY_KEY_ID.includes('placeholder') ||
        data.RAZORPAY_KEY_SECRET.includes('placeholder') ||
        data.RAZORPAY_WEBHOOK_SECRET.includes('placeholder')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message:
            'Razorpay credentials cannot use placeholder values in production mode',
        });
      }

      // 6. OTP provider mode cannot be mock in production
      if (data.OTP_PROVIDER_MODE === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_PROVIDER_MODE'],
          message: 'OTP_PROVIDER_MODE cannot be mock in production mode',
        });
      }

      // 7. Job runner mode cannot be mock or in-memory in production
      if (data.JOB_RUNNER_MODE === 'mock' || data.JOB_RUNNER_MODE === 'in_memory') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JOB_RUNNER_MODE'],
          message:
            'JOB_RUNNER_MODE cannot be mock or in-memory in production mode (requires bullmq_redis)',
        });
      }

      // 8. Redis URL is required in production
      if (!data.REDIS_URL || data.REDIS_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required in production mode',
        });
      }

      // 9. Wildcard CORS is prohibited in production
      if (data.CORS_ORIGINS === '*' || data.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message:
            'Wildcard CORS_ORIGINS is prohibited when credentials are enabled in production',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof EnvSchema>;

const SENSITIVE_KEYS = new Set([
  'DATABASE_URL',
  'SUPABASE_JWT_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'REDIS_URL',
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
