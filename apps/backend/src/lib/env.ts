import { z } from 'zod';

/**
 * Zod schema for Medusa backend environment variables.
 * Validates all required and optional env vars at startup.
 */
export const backendEnvSchema = z.object({
  // === Required: Core Infrastructure ===
  DATABASE_URL: z.string().min(1, 'DATABASE_URL cannot be empty'),
  REDIS_URL: z.string().min(1, 'REDIS_URL cannot be empty'),

  // === Required: Authentication Secrets ===
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for security'),
  COOKIE_SECRET: z.string().min(1, 'COOKIE_SECRET cannot be empty'),

  // === Required: Stripe Configuration ===
  STRIPE_SECRET_KEY: z.string().refine((val) => val.startsWith('sk_'), {
    message: 'STRIPE_SECRET_KEY must start with "sk_"',
  }),
  STRIPE_PUBLISHABLE_KEY: z.string().refine((val) => val.startsWith('pk_'), {
    message: 'STRIPE_PUBLISHABLE_KEY must start with "pk_"',
  }),
  STRIPE_WEBHOOK_SECRET: z.string().refine((val) => val.startsWith('whsec_'), {
    message: 'STRIPE_WEBHOOK_SECRET must start with "whsec_"',
  }),

  // === Required: CORS Configuration ===
  STORE_CORS: z.string().min(1, 'STORE_CORS cannot be empty'),
  ADMIN_CORS: z.string().min(1, 'ADMIN_CORS cannot be empty'),
  AUTH_CORS: z.string().min(1, 'AUTH_CORS cannot be empty'),

  // === Required: Storefront URL ===
  STOREFRONT_URL: z.string().url('STOREFRONT_URL must be a valid URL'),

  // === Required: Email (Resend) ===
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY cannot be empty'),
  RESEND_FROM_EMAIL: z.string().email('RESEND_FROM_EMAIL must be a valid email'),

  // === Optional: S3/R2 Storage ===
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_CACHE_CONTROL: z.string().optional(),

  // === Optional: Database SSL ===
  DATABASE_SSL: z.string().optional(),
  DATABASE_SSL_ALLOW_INSECURE: z.string().optional(),

  // === Optional: Feature Flags ===
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PAYMENT_CAPTURE_DELAY_MS: z.coerce.number().optional(),
  PAYMENT_CAPTURE_WORKER_CONCURRENCY: z.coerce.number().optional(),
  CAPTURE_BUFFER_SECONDS: z.coerce.number().optional(),

  // === Optional: Analytics ===
  POSTHOG_LOG_INFO: z.string().optional(),

  // === Optional: Medusa Feature Flags ===
  MEDUSA_FF_TRANSLATION: z.string().optional(),
  MEDUSA_FF_RBAC: z.string().optional(),
});

export type BackendEnv = z.infer<typeof backendEnvSchema>;

// Cached validated environment
let cachedEnv: BackendEnv | null = null;

/**
 * Validates the backend environment.
 * Note: Uses console for early-stage logging before Medusa container is available.
 * The loader uses the proper Medusa logger.
 * @returns Validated and typed environment object
 * @throws Error if required variables are missing or invalid
 */
export function validateBackendEnv(): BackendEnv {
  const result = backendEnvSchema.safeParse(process.env);

  if (!result.success) {
    // Extract the first error message for a cleaner throw
    const firstIssue = result.error.issues[0];
    const errorMessage = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'Unknown environment validation error';

    throw new Error(`Environment validation failed: ${errorMessage}`);
  }

  return result.data;
}

/**
 * Gets the validated environment, caching the result.
 * Use this throughout the application instead of direct process.env access.
 */
export function getEnv(): BackendEnv {
  if (!cachedEnv) {
    cachedEnv = validateBackendEnv();
  }
  return cachedEnv;
}

/**
 * Validates environment and returns issues for logging.
 * Use this with the Medusa logger in loaders.
 */
export function validateBackendEnvWithIssues(): { env: BackendEnv | null; issues: z.ZodIssue[]; warnings: string[] } {
  const result = backendEnvSchema.safeParse(process.env);
  const warnings: string[] = [];

  if (!result.success) {
    return { env: null, issues: result.error.issues, warnings };
  }

  // Collect warnings for optional but recommended variables
  if (!result.data.S3_ENDPOINT) {
    warnings.push('S3_ENDPOINT not set. File uploads will not work.');
  }

  return { env: result.data, issues: [], warnings };
}
