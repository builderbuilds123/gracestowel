import Stripe from "stripe";

/**
 * Stripe API Version
 * 
 * Best Practice: Use the API version that matches your installed Stripe SDK.
 * The SDK version (19.3.1) defaults to "2025-10-29.clover".
 * 
 * When upgrading Stripe SDK:
 * 1. Check the new default API version in node_modules/stripe/esm/apiVersion.js
 * 2. Update this constant to match
 * 3. Review Stripe's API changelog for breaking changes
 * 4. Test all Stripe integrations (webhooks, payments, refunds)
 * 
 * @see https://stripe.com/docs/api/versioning
 * @see https://stripe.com/docs/upgrades#api-versions
 */
export const STRIPE_API_VERSION = "2025-10-29.clover" as Stripe.LatestApiVersion;

let stripeClient: Stripe | null = null;

/**
 * Get singleton Stripe client instance
 * 
 * Uses the centralized API version to ensure consistency across the application.
 * The client is lazily initialized and cached for reuse.
 * 
 * @throws Error if STRIPE_SECRET_KEY is not configured
 */
export function getStripeClient(): Stripe {
    if (stripeClient) {
        return stripeClient;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    stripeClient = new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
    });

    return stripeClient;
}

/**
 * Create a new Stripe client instance (for testing or special cases)
 * 
 * Use getStripeClient() for normal usage. This function is useful for:
 * - Unit tests that need isolated instances
 * - Cases requiring different configuration
 * 
 * @param secretKey - Stripe secret key (defaults to env var)
 */
export function createStripeClient(secretKey?: string): Stripe {
    const key = secretKey || process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    return new Stripe(key, {
        apiVersion: STRIPE_API_VERSION,
    });
}
