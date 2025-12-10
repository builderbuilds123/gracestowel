import { modificationTokenService, ModificationTokenService } from '../../src/services/modification-token';

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

    // Story 4.1 Security Tests
    describe('security - signature validation', () => {
        it('should use random fallback secrets in dev (instances have different secrets)', () => {
            const originalSecret = process.env.JWT_SECRET;
            delete process.env.JWT_SECRET;

            try {
                // Because fallback is now random per instance, two instances without provided secret 
                // will generate different secrets
                const serviceA = new ModificationTokenService();
                const serviceB = new ModificationTokenService();
                
                const token = serviceA.generateToken(testOrderId, testPaymentIntentId);
                const result = serviceB.validateToken(token);
                
                expect(result.valid).toBe(false);
                expect(result.error).toBe("Invalid token");
            } finally {
                process.env.JWT_SECRET = originalSecret;
            }
        });

        it('should validate correctly when using same instance', () => {
            const service = new ModificationTokenService();
             const token = service.generateToken(testOrderId, testPaymentIntentId);
            const result = service.validateToken(token);
            expect(result.valid).toBe(true);
        });
    });

    describe('security - production environment validation', () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalJwtSecret = process.env.JWT_SECRET;

        afterEach(() => {
            // Restore environment variables
            process.env.NODE_ENV = originalNodeEnv!;
            if (originalJwtSecret) {
                process.env.JWT_SECRET = originalJwtSecret;
            } else {
                delete process.env.JWT_SECRET;
            }
        });

        it('should throw error in production mode when JWT_SECRET is not set', () => {
            delete process.env.JWT_SECRET;
            process.env.NODE_ENV = 'production';
            
            expect(() => {
                new ModificationTokenService();
            }).toThrow('[CRITICAL] JWT_SECRET environment variable is required in production');
        });

        it('should throw error in production mode when JWT_SECRET is too weak', () => {
            process.env.NODE_ENV = 'production';
            process.env.JWT_SECRET = 'short'; // < 32 chars
            
            expect(() => {
                new ModificationTokenService();
            }).toThrow('[CRITICAL] JWT_SECRET is too weak');
        });

        it('should use provided secret in production mode', () => {
            process.env.NODE_ENV = 'production';
            process.env.JWT_SECRET = 'prod-secret-value-that-is-very-long-and-secure';
            
            // Should not throw
            expect(() => {
                const service = new ModificationTokenService();
                const token = service.generateToken(testOrderId, testPaymentIntentId);
                expect(token).toBeDefined();
            }).not.toThrow();
        });
    });

    describe('expiry logic - custom createdAt', () => {
        it('should expire token based on provided createdAt', () => {
            const service = new ModificationTokenService();
            // Order created 2 hours ago
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            
            // Token generated NOW, but for an order from 2 hours ago
            const token = service.generateToken(testOrderId, testPaymentIntentId, twoHoursAgo);
            
            // Should be expired immediately because 2 hours > 1 hour window
            const result = service.validateToken(token);
            
            expect(result.valid).toBe(false);
            expect(result.expired).toBe(true);
        });

        it('should expose original error details', () => {
            const service = new ModificationTokenService();
            const result = service.validateToken("invalid.token");
            
            expect(result.valid).toBe(false);
            expect(result.originalError).toBeDefined();
        });
    });
});
