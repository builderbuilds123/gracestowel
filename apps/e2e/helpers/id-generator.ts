import { randomUUID } from 'crypto';

/**
 * Generate a unique test ID with optional prefix
 */
export function generateTestId(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = randomUUID().slice(0, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a unique email for test customers
 */
export function generateTestEmail(): string {
  const id = generateTestId('user');
  return `${id}@test.gracestowel.com`;
}

/**
 * Generate a unique phone number for testing
 */
export function generateTestPhone(): string {
  const random = Math.floor(Math.random() * 9000000) + 1000000;
  return `+1555${random}`;
}

/**
 * Check if an ID is a test ID (for cleanup)
 */
export function isTestId(id: string): boolean {
  return id.startsWith('test_') || id.includes('@test.gracestowel.com');
}
