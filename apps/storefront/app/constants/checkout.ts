/**
 * Checkout Constants
 *
 * Centralized configuration for checkout-related timing, limits, and thresholds.
 * These values were previously scattered as magic numbers throughout the codebase.
 *
 * @module constants/checkout
 */

export const CHECKOUT_CONSTANTS = {
  // ============================================
  // Debounce Delays
  // ============================================

  /**
   * Debounce delay for address change events before triggering shipping rate fetch.
   * Prevents excessive API calls while user is typing.
   */
  ADDRESS_DEBOUNCE_MS: 600,

  /**
   * Debounce delay for payment collection creation.
   * Batches rapid cart changes (e.g., quantity updates) into a single request.
   */
  PAYMENT_COLLECTION_DEBOUNCE_MS: 100,

  // ============================================
  // Timeouts & Delays
  // ============================================

  /**
   * Delay before clearing cart data after successful order.
   * Allows UI updates to complete before removing cart context.
   */
  CART_CLEAR_DELAY_MS: 500,

  /**
   * Delay between retry attempts when fetching order from Medusa.
   * Order may not exist immediately after payment success due to webhook processing.
   */
  ORDER_FETCH_RETRY_DELAY_MS: 1000,

  /**
   * Maximum number of retry attempts for fetching order after payment.
   * 10 attempts × 1s = 10 seconds maximum wait for order creation.
   */
  ORDER_FETCH_MAX_RETRIES: 10,

  // ============================================
  // Cookie & Session Settings
  // ============================================

  /**
   * Maximum age for checkout params cookie in seconds.
   * Used during Stripe redirect flow to preserve payment intent info.
   * 600 seconds = 10 minutes (generous time for payment provider roundtrip)
   */
  CHECKOUT_PARAMS_MAX_AGE_SECONDS: 600,

  // ============================================
  // Cache TTL
  // ============================================

  /**
   * Cache duration for shipping options in seconds.
   * Shipping options rarely change, but we keep it short enough for price updates.
   */
  SHIPPING_OPTIONS_CACHE_SECONDS: 60,

  // ============================================
  // Retry Configuration
  // ============================================

  /**
   * Number of retry attempts for transient failures (network, etc.)
   */
  FETCH_MAX_RETRIES: 3,

  /**
   * Initial delay between retry attempts in milliseconds.
   * Uses exponential backoff: 1000ms, 2000ms, 4000ms
   */
  FETCH_RETRY_DELAY_MS: 1000,
} as const;

/**
 * Type for checkout constants - ensures type safety when accessing values.
 */
export type CheckoutConstantsType = typeof CHECKOUT_CONSTANTS;
