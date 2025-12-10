import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Payload structure for the modification token JWT
 */
export interface ModificationTokenPayload {
    order_id: string;
    payment_intent_id: string;
    iat: number;
    exp: number;
}

/**
 * Validation result for modification tokens
 */
export interface TokenValidationResult {
    valid: boolean;
    payload?: ModificationTokenPayload;
    error?: string;
    expired?: boolean;
    originalError?: string;
}

/**
 * Configuration for the modification token
 */
const MODIFICATION_WINDOW_SECONDS = 60 * 60; // 1 hour

/**
 * ModificationTokenService
 * 
 * Handles generation and validation of JWT tokens used for order modification
 * within the 1-hour window after purchase.
 * 
 * The token is:
 * - Generated at order creation time
 * - Embedded in the order success URL and confirmation email
 * - Required for all modification endpoints (cancel, edit address, add items)
 * - Expires exactly 1 hour after order creation
 */
export class ModificationTokenService {
    private readonly secret: string;
    private readonly windowSeconds: number;

    constructor(secret?: string, windowSeconds?: number) {
        const envSecret = secret || process.env.JWT_SECRET;
        if (!envSecret) {
            const isProduction = process.env.NODE_ENV === "production";
            const isTest = process.env.NODE_ENV === "test" || process.env.TEST_TYPE;
            if (isProduction) {
                throw new Error("[CRITICAL] JWT_SECRET environment variable is required in production");
            }
            // In non-production, use a dev-only fallback but log a warning
            if (!isTest) {
                console.warn("[SECURITY] JWT_SECRET not set - using random dev fallback. Set JWT_SECRET in production!");
            }
            // Generate a random fallback secret for this instance to prevent hardcoded secret reuse
            this.secret = crypto.randomBytes(32).toString('hex');
        } else {
            // Validate secret strength in production
            if (process.env.NODE_ENV === "production" && envSecret.length < 32) {
                throw new Error("[CRITICAL] JWT_SECRET is too weak. Must be at least 32 characters.");
            }
            this.secret = envSecret;
        }
        this.windowSeconds = windowSeconds || MODIFICATION_WINDOW_SECONDS;
    }

    /**
     * Generate a modification token for an order
     * 
     * @param orderId - The Medusa order ID
     * @param paymentIntentId - The Stripe PaymentIntent ID
     * @param createdAt - Optional order creation time to anchor expiry (defaults to now)
     * @returns The signed JWT token
     */
    generateToken(orderId: string, paymentIntentId: string, createdAt?: Date): string {
        // Use provided createdAt or "now" to calculate specific expiry
        // This ensures token matches business window even if generated later (e.g. retries)
        const timestamp = createdAt ? Math.floor(createdAt.getTime() / 1000) : Math.floor(Date.now() / 1000);
        
        const payload = {
            order_id: orderId,
            payment_intent_id: paymentIntentId,
            iat: Math.floor(Date.now() / 1000), // Issued NOW
            exp: timestamp + this.windowSeconds, // Expires relative to ORDER creation
        };

        return jwt.sign(payload, this.secret, { algorithm: "HS256" });
    }

    /**
     * Validate a modification token
     * 
     * @param token - The JWT token to validate
     * @returns Validation result with payload if valid
     */
    validateToken(token: string): TokenValidationResult {
        try {
            const payload = jwt.verify(token, this.secret, {
                algorithms: ["HS256"],
            }) as ModificationTokenPayload;

            return {
                valid: true,
                payload,
            };
        } catch (error: any) {
            const errorMsg = error.message || "Unknown error";
            
            if (error instanceof jwt.TokenExpiredError) {
                return {
                    valid: false,
                    expired: true,
                    error: "Modification window has expired",
                    originalError: errorMsg,
                };
            }

            if (error instanceof jwt.JsonWebTokenError) {
                return {
                    valid: false,
                    error: "Invalid token",
                    originalError: errorMsg,
                };
            }

            return {
                valid: false,
                error: "Token validation failed",
                originalError: errorMsg,
            };
        }
    }

    /**
     * Get the remaining time in seconds for a valid token
     * 
     * @param token - The JWT token
     * @returns Remaining seconds or 0 if expired/invalid
     */
    getRemainingTime(token: string): number {
        const result = this.validateToken(token);
        if (!result.valid || !result.payload) {
            return 0;
        }

        const now = Math.floor(Date.now() / 1000);
        const remaining = result.payload.exp - now;
        return Math.max(0, remaining);
    }

    /**
     * Check if an order is within its modification window
     * 
     * @param orderCreatedAt - The order creation timestamp
     * @returns Whether the order can still be modified
     */
    isWithinModificationWindow(orderCreatedAt: Date): boolean {
        const now = Date.now();
        const createdAt = orderCreatedAt.getTime();
        const windowEnd = createdAt + this.windowSeconds * 1000;
        return now < windowEnd;
    }

    /**
     * Get remaining modification time for an order
     * 
     * @param orderCreatedAt - The order creation timestamp
     * @returns Remaining seconds or 0 if expired
     */
    getRemainingTimeFromOrder(orderCreatedAt: Date): number {
        const now = Date.now();
        const createdAt = orderCreatedAt.getTime();
        const windowEnd = createdAt + this.windowSeconds * 1000;
        const remaining = Math.floor((windowEnd - now) / 1000);
        return Math.max(0, remaining);
    }
}

// Export singleton instance
export const modificationTokenService = new ModificationTokenService();

