import { modificationTokenService } from '../../src/services/modification-token';

describe('ModificationTokenService', () => {
    const testOrderId = 'order_test123';
    const testPaymentIntentId = 'pi_test456';

    describe('generateToken', () => {
        it('should generate a valid JWT token', () => {
            const token = modificationTokenService.generateToken(testOrderId, testPaymentIntentId);
            
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
        });

        it('should generate different tokens for different orders', () => {
            const token1 = modificationTokenService.generateToken('order_1', testPaymentIntentId);
            const token2 = modificationTokenService.generateToken('order_2', testPaymentIntentId);
            
            expect(token1).not.toBe(token2);
        });
    });

    describe('validateToken', () => {
        it('should validate a valid token', () => {
            const token = modificationTokenService.generateToken(testOrderId, testPaymentIntentId);
            const result = modificationTokenService.validateToken(token);
            
            expect(result.valid).toBe(true);
            expect(result.payload).toBeDefined();
            expect(result.payload?.order_id).toBe(testOrderId);
            expect(result.payload?.payment_intent_id).toBe(testPaymentIntentId);
        });

        it('should reject an invalid token', () => {
            const result = modificationTokenService.validateToken('invalid.token.here');
            
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should reject an empty token', () => {
            const result = modificationTokenService.validateToken('');
            
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should reject a malformed token', () => {
            const result = modificationTokenService.validateToken('not-a-jwt');
            
            expect(result.valid).toBe(false);
        });
    });

    describe('getRemainingTime', () => {
        it('should return positive remaining time for a fresh token', () => {
            const token = modificationTokenService.generateToken(testOrderId, testPaymentIntentId);
            const remaining = modificationTokenService.getRemainingTime(token);
            
            // Token should be valid for about 1 hour (3600 seconds)
            expect(remaining).toBeGreaterThan(3500);
            expect(remaining).toBeLessThanOrEqual(3600);
        });

        it('should return 0 for an invalid token', () => {
            const remaining = modificationTokenService.getRemainingTime('invalid.token');
            
            expect(remaining).toBe(0);
        });
    });

    describe('token expiration', () => {
        it('should include expiration in the token payload', () => {
            const token = modificationTokenService.generateToken(testOrderId, testPaymentIntentId);
            const result = modificationTokenService.validateToken(token);
            
            expect(result.payload?.exp).toBeDefined();
            expect(result.payload?.iat).toBeDefined();
            // exp should be ~1 hour after iat
            const diff = (result.payload?.exp || 0) - (result.payload?.iat || 0);
            expect(diff).toBe(3600);
        });
    });
});

