/**
 * FNV-1a Hash Implementation
 *
 * Fast, non-cryptographic hash function with good distribution properties.
 * Used for generating deterministic identifiers (e.g., idempotency keys).
 *
 * References:
 * - http://www.isthe.com/chongo/tech/comp/fnv/
 * - https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 */

/**
 * Generate FNV-1a hash of input string
 *
 * @param input - String to hash
 * @returns 8-character base36 hash (lowercase alphanumeric)
 *
 * @example
 * fnv1aHash('hello world') // returns '1c2xn1jy'
 * fnv1aHash('hello world') // returns '1c2xn1jy' (deterministic)
 * fnv1aHash('hello worlD') // returns different hash
 */
export function fnv1aHash(input: string): string {
  // FNV-1a parameters for 32-bit hash
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < input.length; i++) {
    // XOR with byte
    hash ^= input.charCodeAt(i);

    // Multiply by FNV prime and force unsigned 32-bit
    hash = (Math.imul(hash, FNV_PRIME) >>> 0);
  }

  // Convert to base36 (0-9, a-z) and pad to 8 characters
  return (hash >>> 0).toString(36).padStart(8, '0');
}
