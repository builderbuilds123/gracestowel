import { describe, expect, it } from 'vitest';
import { storefrontEnvSchema, validateStorefrontEnv } from './env.server';

describe('storefrontEnvSchema', () => {
  const validEnv = {
    MEDUSA_BACKEND_URL: 'http://localhost:9000',
    MEDUSA_PUBLISHABLE_KEY: 'pk_test_123456789',
    STRIPE_SECRET_KEY: 'sk_test_123456789',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_123456789',
  };

  describe('valid environment', () => {
    it('should pass with all required variables', () => {
      const result = storefrontEnvSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
    });

    it('should pass with optional variables included', () => {
      const envWithOptional = {
        ...validEnv,
        DATABASE_URL: 'postgresql://localhost:5432/medusa',
        JWT_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
        VITE_POSTHOG_API_KEY: 'phc_test123',
        VITE_POSTHOG_HOST: 'https://app.posthog.com',
      };
      const result = storefrontEnvSchema.safeParse(envWithOptional);
      expect(result.success).toBe(true);
    });
  });

  describe('missing required variables', () => {
    it('should fail when MEDUSA_BACKEND_URL is missing', () => {
      const { MEDUSA_BACKEND_URL, ...envWithoutUrl } = validEnv;
      const result = storefrontEnvSchema.safeParse(envWithoutUrl);
      expect(result.success).toBe(false);
    });

    it('should fail when MEDUSA_PUBLISHABLE_KEY is missing', () => {
      const { MEDUSA_PUBLISHABLE_KEY, ...envWithoutKey } = validEnv;
      const result = storefrontEnvSchema.safeParse(envWithoutKey);
      expect(result.success).toBe(false);
    });

    it('should fail when STRIPE_SECRET_KEY is missing', () => {
      const { STRIPE_SECRET_KEY, ...envWithoutStripe } = validEnv;
      const result = storefrontEnvSchema.safeParse(envWithoutStripe);
      expect(result.success).toBe(false);
    });

    it('should fail when STRIPE_PUBLISHABLE_KEY is missing', () => {
      const { STRIPE_PUBLISHABLE_KEY, ...envWithoutStripePk } = validEnv;
      const result = storefrontEnvSchema.safeParse(envWithoutStripePk);
      expect(result.success).toBe(false);
    });
  });

  describe('invalid formats', () => {
    it('should fail when MEDUSA_BACKEND_URL is not a valid URL', () => {
      const result = storefrontEnvSchema.safeParse({
        ...validEnv,
        MEDUSA_BACKEND_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when STRIPE_SECRET_KEY does not start with sk_', () => {
      const result = storefrontEnvSchema.safeParse({
        ...validEnv,
        STRIPE_SECRET_KEY: 'wrong_prefix_123',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when STRIPE_PUBLISHABLE_KEY does not start with pk_', () => {
      const result = storefrontEnvSchema.safeParse({
        ...validEnv,
        STRIPE_PUBLISHABLE_KEY: 'wrong_prefix_123',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when JWT_SECRET is too short', () => {
      const result = storefrontEnvSchema.safeParse({
        ...validEnv,
        JWT_SECRET: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateStorefrontEnv function', () => {
    it('should return validated env on success', () => {
      const result = validateStorefrontEnv(validEnv);
      expect(result.MEDUSA_BACKEND_URL).toBe('http://localhost:9000');
      expect(result.STRIPE_SECRET_KEY).toBe('sk_test_123456789');
    });

    it('should throw on validation failure', () => {
      expect(() => validateStorefrontEnv({})).toThrow('Environment validation failed');
    });
  });
});
