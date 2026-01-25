/**
 * Server-side Stripe utility
 *
 * Uses the `stripe` package for server-side API calls.
 * This is separate from the client-side `stripe.ts` which uses `@stripe/stripe-js`.
 */

import Stripe from "stripe";

// Cache Stripe instance per secret key to avoid recreating
const stripeInstances = new Map<string, Stripe>();

/**
 * Get a Stripe instance for server-side API calls
 *
 * @param secretKey - Stripe secret key (from environment)
 * @returns Stripe instance
 */
export function getStripeServerSide(secretKey: string): Stripe {
    if (!secretKey) {
        throw new Error("Stripe secret key is required");
    }

    // Return cached instance if available
    let stripe = stripeInstances.get(secretKey);
    if (!stripe) {
        stripe = new Stripe(secretKey, {
            apiVersion: "2025-12-15.clover",
            typescript: true,
        });
        stripeInstances.set(secretKey, stripe);
    }

    return stripe;
}
