/**
 * Stripe test card numbers for various payment scenarios
 * @see https://stripe.com/docs/testing#cards
 */
export const TEST_CARDS = {
  // Successful payments
  SUCCESS: '4242424242424242',
  SUCCESS_VISA_DEBIT: '4000056655665556',
  SUCCESS_MASTERCARD: '5555555555554444',
  SUCCESS_AMEX: '378282246310005',

  // Declined payments
  DECLINE_GENERIC: '4000000000000002',
  DECLINE_INSUFFICIENT_FUNDS: '4000000000009995',
  DECLINE_LOST_CARD: '4000000000009987',
  DECLINE_STOLEN_CARD: '4000000000009979',
  DECLINE_EXPIRED_CARD: '4000000000000069',
  DECLINE_INCORRECT_CVC: '4000000000000127',
  DECLINE_PROCESSING_ERROR: '4000000000000119',

  // 3D Secure
  REQUIRES_3DS: '4000002760003184',
  REQUIRES_3DS_FAIL: '4000008260003178',
  REQUIRES_3DS_OPTIONAL: '4000002500003155',

  // Special cases
  ATTACH_FAIL: '4000000000000341',
  CHARGE_FAIL: '4000000000000341',
} as const;

export type TestCardKey = keyof typeof TEST_CARDS;
export type TestCardNumber = typeof TEST_CARDS[TestCardKey];

/**
 * Complete card details for form filling
 */
export interface TestCardDetails {
  number: string;
  expiry: string;
  cvc: string;
  zip?: string;
}

/**
 * Get complete card details for a test card
 */
export function getTestCardDetails(card: TestCardKey | TestCardNumber): TestCardDetails {
  const number = typeof card === 'string' && card.length >= 15 && Object.values(TEST_CARDS).includes(card as TestCardNumber)
    ? card
    : TEST_CARDS[card as TestCardKey] || card;

  // If a raw number that is not in TEST_CARDS is passed, we accept it if it looks like a card number,
  // but let's assume valid inputs or fallback to provided string.

  const cardNumber = String(number);

  return {
    number: cardNumber,
    expiry: '12/30', // Future date
    cvc: cardNumber.startsWith('37') ? '1234' : '123', // AMEX uses 4-digit CVC
    zip: '12345',
  };
}

/**
 * Format card number for display (with spaces)
 */
export function formatCardNumber(number: string): string {
  return number.replace(/(.{4})/g, '$1 ').trim();
}
