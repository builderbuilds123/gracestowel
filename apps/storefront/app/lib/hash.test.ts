import { describe, it, expect } from 'vitest';
import { fnv1aHash } from './hash';

describe('fnv1aHash', () => {
    it('should generate consistent hash for same input', () => {
        const input = 'hello world';
        const hash1 = fnv1aHash(input);
        const hash2 = fnv1aHash(input);

        expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
        const hash1 = fnv1aHash('hello world');
        const hash2 = fnv1aHash('hello worlD'); // Different case

        expect(hash1).not.toBe(hash2);
    });

    it('should generate 8-character hash', () => {
        const hash = fnv1aHash('test');

        expect(hash).toHaveLength(8);
    });

    it('should generate alphanumeric hash (base36)', () => {
        const hash = fnv1aHash('test');

        // Base36 uses 0-9 and a-z
        expect(hash).toMatch(/^[0-9a-z]{8}$/);
    });

    it('should handle empty string', () => {
        const hash = fnv1aHash('');

        expect(hash).toHaveLength(8);
        expect(hash).toMatch(/^[0-9a-z]{8}$/);
    });

    it('should handle very long strings', () => {
        const longString = 'a'.repeat(10000);
        const hash = fnv1aHash(longString);

        expect(hash).toHaveLength(8);
        expect(hash).toMatch(/^[0-9a-z]{8}$/);
    });

    it('should generate different hashes for similar inputs', () => {
        // Test collision resistance with similar inputs
        const hash1 = fnv1aHash('cart_123_100_usd');
        const hash2 = fnv1aHash('cart_123_101_usd');
        const hash3 = fnv1aHash('cart_124_100_usd');

        expect(hash1).not.toBe(hash2);
        expect(hash1).not.toBe(hash3);
        expect(hash2).not.toBe(hash3);
    });

    it('should be deterministic across multiple calls', () => {
        const input = 'pi|cart_abc123|2500|usd|var_1:2:12.50';
        const hashes = Array.from({ length: 100 }, () => fnv1aHash(input));

        // All hashes should be identical
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(1);
    });
});
