/**
 * @deprecated This file uses static test data patterns.
 * 
 * MIGRATION GUIDE:
 * - Use factories from `support/factories/` instead
 * - Import: `import { createUser, createProduct } from '../support/factories'`
 * - Factories provide parallel-safe, unique data with faker
 * 
 * This file is kept for backward compatibility but should not be used in new tests.
 * 
 * Example migration:
 * 
 * OLD:
 * ```typescript
 * import { testCustomer } from '../fixtures/test-data';
 * const customer = testCustomer;
 * ```
 * 
 * NEW:
 * ```typescript
 * import { createUser } from '../support/factories';
 * const customer = createUser({ email: 'test@example.com' });
 * ```
 */

import { createUser, createProduct } from "../support/factories";

/**
 * @deprecated Use createUser() from support/factories instead
 */
export const testCustomer = {
  firstName: "Test",
  lastName: "Customer",
  email: "test.customer@example.com",
  phone: "+1234567890",
};

/**
 * @deprecated Use createUser() with address overrides instead
 */
export const testAddress = {
  address1: "123 Test Street",
  address2: "Apt 4B",
  city: "Test City",
  state: "CA",
  postalCode: "90210",
  country: "US",
};

/**
 * Stripe test card numbers - these are still valid for payment testing
 */
export const testPayment = {
  // Stripe test card numbers
  validCard: "4242424242424242",
  declinedCard: "4000000000000002",
  insufficientFunds: "4000000000009995",
  expiredCard: "4000000000000069",
  processingError: "4000000000000119",
  // Common test values
  expiry: "12/30",
  cvc: "123",
};

/**
 * @deprecated Use createProduct() from support/factories instead
 */
export const testProducts = {
  towel: {
    name: "Premium Bath Towel",
    handle: "premium-bath-towel",
    price: 29.99,
  },
  giftSet: {
    name: "Luxury Gift Set",
    handle: "luxury-gift-set",
    price: 89.99,
  },
};

/**
 * @deprecated Use createUser() which generates unique emails automatically
 * 
 * Example:
 * ```typescript
 * const user = createUser(); // Email is automatically unique
 * ```
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test.${timestamp}.${random}@example.com`;
}

/**
 * @deprecated Use createOrder() from support/factories instead
 * 
 * Example:
 * ```typescript
 * import { createOrder } from '../support/factories';
 * const order = createOrder(); // ID is automatically unique
 * ```
 */
export function generateOrderRef(): string {
  return `TEST-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
}
