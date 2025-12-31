/**
 * Secure Logging Utilities
 * 
 * Masks sensitive data (PII, PHI, payment secrets) from logs to prevent
 * exposure in console, telemetry, or error tracking services.
 * 
 * SECURITY: Never log full payment intent objects, client secrets, addresses,
 * or other sensitive customer data.
 */

/**
 * Mask a payment intent ID - shows only first 3 and last 4 characters
 * Example: "pi_1234567890abcdef" -> "pi_***...cdef"
 */
export function maskPaymentIntentId(id: string | null | undefined): string {
    if (!id) return "[MASKED]";
    if (id.length <= 7) return "[MASKED]";
    return `${id.substring(0, 3)}***...${id.substring(id.length - 4)}`;
}

/**
 * Mask a client secret - shows only last 4 characters
 * Example: "pi_123_secret_abc123xyz" -> "***...xyz"
 */
export function maskClientSecret(secret: string | null | undefined): string {
    if (!secret) return "[MASKED]";
    if (secret.length <= 4) return "[MASKED]";
    return `***...${secret.substring(secret.length - 4)}`;
}

/**
 * Mask an email address - shows only first 2 characters and domain
 * Example: "john.doe@example.com" -> "jo***@example.com"
 */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return "[MASKED]";
    const [local, domain] = email.split("@");
    if (!domain) return "[MASKED]";
    if (local.length <= 2) return `***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
}

/**
 * Mask a shipping address - removes street address, keeps city/state
 * Example: "123 Main St, New York, NY 10001" -> "[MASKED], New York, NY 10001"
 */
export function maskAddress(address: string | null | undefined): string {
    if (!address) return "[MASKED]";
    // Keep only city, state, and zip (last 3 parts typically)
    const parts = address.split(",").map(p => p.trim());
    if (parts.length <= 2) return "[MASKED]";
    // Remove first part (street address), keep rest
    return `[MASKED], ${parts.slice(1).join(", ")}`;
}

/**
 * Mask an order ID - shows only first 3 and last 4 characters
 */
export function maskOrderId(id: string | null | undefined): string {
    if (!id) return "[MASKED]";
    if (id.length <= 7) return "[MASKED]";
    return `${id.substring(0, 3)}***...${id.substring(id.length - 4)}`;
}

/**
 * Mask a customer ID - shows only first 3 and last 4 characters
 */
export function maskCustomerId(id: string | null | undefined): string {
    if (!id) return "[MASKED]";
    if (id.length <= 7) return "[MASKED]";
    return `${id.substring(0, 3)}***...${id.substring(id.length - 4)}`;
}

/**
 * Safely log payment-related data with automatic masking
 * Only logs non-sensitive fields and masked versions of sensitive ones
 */
export function logPaymentInfo(
    message: string,
    data: {
        paymentIntentId?: string | null;
        redirectStatus?: string | null;
        status?: string | null;
        amount?: number | null;
        currency?: string | null;
        [key: string]: unknown;
    }
): void {
    const masked: Record<string, unknown> = {
        ...data,
    };
    
    // Mask payment intent ID if present
    if (data.paymentIntentId) {
        masked.paymentIntentId = maskPaymentIntentId(data.paymentIntentId);
    }
    
    // Remove any client secret fields
    delete masked.paymentIntentClientSecret;
    delete masked.clientSecret;
    
    // Remove undefined values
    Object.keys(masked).forEach(key => {
        if (masked[key] === undefined) delete masked[key];
    });
    
    console.log(message, masked);
}

/**
 * Safely log error without exposing sensitive data in error messages
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
    const safeContext = context ? maskSensitiveFields(context) : {};
    
    if (error instanceof Error) {
        // Only log error message, not full stack (stack may contain sensitive data)
        console.error(message, {
            error: {
                name: error.name,
                message: error.message,
                // Don't log stack trace in production
            },
            ...safeContext,
        });
    } else {
        console.error(message, { error: String(error), ...safeContext });
    }
}

/**
 * Mask sensitive fields in an object recursively
 */
function maskSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    const sensitiveKeys = [
        "paymentIntentId",
        "paymentIntentClientSecret",
        "clientSecret",
        "secret",
        "token",
        "email",
        "address",
        "shipping",
        "billing",
        "customerId",
        "orderId",
    ];
    
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
            if (typeof value === "string") {
                if (lowerKey.includes("email")) {
                    masked[key] = maskEmail(value);
                } else if (lowerKey.includes("address") || lowerKey.includes("shipping") || lowerKey.includes("billing")) {
                    masked[key] = maskAddress(value);
                } else if (lowerKey.includes("paymentintentid") || lowerKey.includes("payment_intent_id")) {
                    masked[key] = maskPaymentIntentId(value);
                } else if (lowerKey.includes("secret") || lowerKey.includes("client_secret")) {
                    masked[key] = maskClientSecret(value);
                } else if (lowerKey.includes("orderid") || lowerKey.includes("order_id")) {
                    masked[key] = maskOrderId(value);
                } else if (lowerKey.includes("customerid") || lowerKey.includes("customer_id")) {
                    masked[key] = maskCustomerId(value);
                } else {
                    masked[key] = "[MASKED]";
                }
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                masked[key] = maskSensitiveFields(value as Record<string, unknown>);
            } else {
                masked[key] = "[MASKED]";
            }
        } else if (value && typeof value === "object" && !Array.isArray(value) && value.constructor === Object) {
            masked[key] = maskSensitiveFields(value as Record<string, unknown>);
        } else {
            masked[key] = value;
        }
    }
    
    return masked;
}

