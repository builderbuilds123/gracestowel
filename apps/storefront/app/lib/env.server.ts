import { z } from 'zod';

/**
 * Zod schema for Cloudflare Workers environment variables.
 * Validates all required and optional env vars at runtime.
 */
export const storefrontEnvSchema = z.object({
  // === Required: Core Medusa Configuration ===
  MEDUSA_BACKEND_URL: z
    .string({ required_error: 'MEDUSA_BACKEND_URL is required' })
    .url('MEDUSA_BACKEND_URL must be a valid URL'),
  MEDUSA_PUBLISHABLE_KEY: z
    .string({ required_error: 'MEDUSA_PUBLISHABLE_KEY is required' })
    .min(1, 'MEDUSA_PUBLISHABLE_KEY cannot be empty'),

  // === Required: Stripe Configuration ===
  STRIPE_SECRET_KEY: z
    .string({ required_error: 'STRIPE_SECRET_KEY is required' })
    .refine((val) => val.startsWith('sk_'), {
      message: 'STRIPE_SECRET_KEY must start with "sk_"',
    }),
  STRIPE_PUBLISHABLE_KEY: z
    .string({ required_error: 'STRIPE_PUBLISHABLE_KEY is required' })
    .refine((val) => val.startsWith('pk_'), {
      message: 'STRIPE_PUBLISHABLE_KEY must start with "pk_"',
    }),

  // === Optional: Database (Hyperdrive) ===
  DATABASE_URL: z.string().optional(),

  // === Optional: Session Security ===
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET should be at least 32 characters for security')
    .optional(),

  // === Optional: Analytics (PostHog) ===
  VITE_POSTHOG_API_KEY: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().url().optional(),
});

export type StorefrontEnv = z.infer<typeof storefrontEnvSchema>;

/**
 * Validates the Cloudflare Workers environment.
 * @param env - The environment object from context.cloudflare.env
 * @returns Validated and typed environment object
 * @throws Error if required variables are missing or invalid
 */
export function validateStorefrontEnv(env: Record<string, unknown>): StorefrontEnv {
  const result = storefrontEnvSchema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('[ENV] Storefront environment validation failed:', JSON.stringify(formatted, null, 2));

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
 * Validates environment with warnings for optional but recommended vars.
 * Use this in development to catch missing optional configs.
 */
export function validateStorefrontEnvWithWarnings(env: Record<string, unknown>): StorefrontEnv {
  const validated = validateStorefrontEnv(env);

  // Warn about missing optional but recommended variables
  if (!validated.DATABASE_URL) {
    console.warn('[ENV] Warning: DATABASE_URL not set. Direct database reads will not work.');
  }

  if (!validated.VITE_POSTHOG_API_KEY) {
    console.warn('[ENV] Warning: VITE_POSTHOG_API_KEY not set. Analytics will be disabled.');
  }

  return validated;
}
