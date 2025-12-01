/**
 * Test data fixtures for E2E tests
 * These provide consistent test data for seeding and assertions
 */

export const testCustomer = {
  firstName: "Test",
  lastName: "Customer",
  email: "test.customer@example.com",
  phone: "+1234567890",
};

export const testAddress = {
  address1: "123 Test Street",
  address2: "Apt 4B",
  city: "Test City",
  state: "CA",
  postalCode: "90210",
  country: "US",
};

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
 * Generate unique email for test isolation
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test.${timestamp}.${random}@example.com`;
}

/**
 * Generate unique order reference
 */
export function generateOrderRef(): string {
  return `TEST-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
}

