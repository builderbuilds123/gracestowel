/**
 * Shared Stripe retry utility functions
 * Extracted from workflows to reduce code duplication
 */

import Stripe from "stripe";

/**
 * Retry utility with exponential backoff.
 * 
 * @param fn - Function to retry
 * @param options.maxRetries - Maximum number of RETRY attempts (default: 3)
 *                            Total attempts = 1 (initial) + maxRetries
 * @param options.initialDelayMs - Initial delay before first retry (default: 200ms)
 * @param options.factor - Exponential backoff factor (default: 2)
 * @param options.shouldRetry - Predicate to determine if error is retryable
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        initialDelayMs?: number;
        factor?: number;
        shouldRetry?: (error: any) => boolean;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelayMs = 200,
        factor = 2,
        shouldRetry = () => true,
    } = options;

    let lastError: any;
    let delayMs = initialDelayMs;

    // Total attempts = 1 (initial) + maxRetries
    // Loop: attempt 0 = initial, attempts 1..maxRetries = retries
    for (let attempt = 0; attempt < maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // If this is the last attempt OR error is not retryable, throw immediately
            if (attempt >= maxRetries || !shouldRetry(error)) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= factor;
        }
    }
    throw lastError;
}

/**
 * Determines if a Stripe error is retryable
 */
export function isRetryableStripeError(error: any): boolean {
    if (error instanceof Stripe.errors.StripeCardError) {
        return false;
    }
    if (error instanceof Stripe.errors.StripeConnectionError) {
        return true;
    }
    if (error instanceof Stripe.errors.StripeAPIError) {
        const statusCode = (error as any).statusCode;
        return statusCode >= 500 || statusCode === 429;
    }
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
        return true;
    }
    return false;
}





