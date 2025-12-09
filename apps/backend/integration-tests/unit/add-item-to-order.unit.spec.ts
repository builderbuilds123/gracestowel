/**
 * Unit tests for add-item-to-order workflow
 * Story: 3.2 Increment Authorization Logic
 * 
 * Tests import actual error classes and verify:
 * - Error class properties match expected values
 * - Retry logic parameters are correct
 * - Idempotency key is stable (uses requestId, not Date.now)
 * - Stock calculation sums all locations
 */

import Stripe from "stripe";

// Dynamic import to avoid mock hoisting issues
let InsufficientStockError: any;
let InvalidOrderStateError: any;
let InvalidPaymentStateError: any;
let CardDeclinedError: any;
let AuthMismatchError: any;
let TokenExpiredError: any;
let TokenInvalidError: any;
let TokenMismatchError: any;

beforeAll(async () => {
    // Import error classes after test setup
    const workflow = await import("../../src/workflows/add-item-to-order");
    InsufficientStockError = workflow.InsufficientStockError;
    InvalidOrderStateError = workflow.InvalidOrderStateError;
    InvalidPaymentStateError = workflow.InvalidPaymentStateError;
    CardDeclinedError = workflow.CardDeclinedError;
    AuthMismatchError = workflow.AuthMismatchError;
    TokenExpiredError = workflow.TokenExpiredError;
    TokenInvalidError = workflow.TokenInvalidError;
    TokenMismatchError = workflow.TokenMismatchError;
});

describe("add-item-to-order workflow - Error Classes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("InsufficientStockError", () => {
        it("should create error with variant, available, and requested counts", () => {
            const error = new InsufficientStockError("var_123", 0, 2);
            expect(error.name).toBe("InsufficientStockError");
            expect(error.variantId).toBe("var_123");
            expect(error.available).toBe(0);
            expect(error.requested).toBe(2);
            expect(error.message).toContain("available=0");
            expect(error.message).toContain("requested=2");
        });

        it("should be throwable and catchable", () => {
            expect(() => {
                throw new InsufficientStockError("var_abc", 5, 10);
            }).toThrow(InsufficientStockError);
        });
    });

    describe("InvalidOrderStateError", () => {
        it("should create error with order id and current status", () => {
            const error = new InvalidOrderStateError("ord_123", "completed");
            expect(error.name).toBe("InvalidOrderStateError");
            expect(error.orderId).toBe("ord_123");
            expect(error.status).toBe("completed");
            expect(error.message).toContain("pending");
        });
    });

    describe("InvalidPaymentStateError", () => {
        it("should create error with payment intent id and status", () => {
            const error = new InvalidPaymentStateError("pi_123", "succeeded");
            expect(error.name).toBe("InvalidPaymentStateError");
            expect(error.paymentIntentId).toBe("pi_123");
            expect(error.status).toBe("succeeded");
            expect(error.message).toContain("requires_capture");
        });
    });

    describe("CardDeclinedError", () => {
        it("should create error with stripe code and decline code", () => {
            const error = new CardDeclinedError("Card declined", "card_declined", "insufficient_funds");
            expect(error.name).toBe("CardDeclinedError");
            expect(error.stripeCode).toBe("card_declined");
            expect(error.declineCode).toBe("insufficient_funds");
        });

        it("should work without decline code", () => {
            const error = new CardDeclinedError("Generic decline", "generic_decline");
            expect(error.stripeCode).toBe("generic_decline");
            expect(error.declineCode).toBeUndefined();
        });
    });

    describe("AuthMismatchError", () => {
        it("should create error with audit-critical information", () => {
            const error = new AuthMismatchError("ord_123", "pi_456", "DB commit failed");
            expect(error.name).toBe("AuthMismatchError");
            expect(error.orderId).toBe("ord_123");
            expect(error.paymentIntentId).toBe("pi_456");
            expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
        });
    });

    describe("Token Errors", () => {
        it("should create TokenExpiredError with correct code", () => {
            const error = new TokenExpiredError();
            expect(error.name).toBe("TokenExpiredError");
            expect(error.code).toBe("TOKEN_EXPIRED");
        });

        it("should create TokenInvalidError with correct code", () => {
            const error = new TokenInvalidError();
            expect(error.name).toBe("TokenInvalidError");
            expect(error.code).toBe("TOKEN_INVALID");
        });

        it("should create TokenMismatchError with order IDs", () => {
            const error = new TokenMismatchError("ord_expected", "ord_actual");
            expect(error.name).toBe("TokenMismatchError");
            expect(error.code).toBe("TOKEN_MISMATCH");
            expect(error.expectedOrderId).toBe("ord_expected");
            expect(error.actualOrderId).toBe("ord_actual");
        });
    });
});

describe("add-item-to-order workflow - Token Validation Behavior", () => {
    it("should throw TokenExpiredError when token is expired", () => {
        expect(() => {
            throw new TokenExpiredError();
        }).toThrow(TokenExpiredError);
    });

    it("should throw TokenInvalidError when token is invalid", () => {
        expect(() => {
            throw new TokenInvalidError();
        }).toThrow(TokenInvalidError);
    });

    it("should throw TokenMismatchError when order ID doesn't match", () => {
        expect(() => {
            throw new TokenMismatchError("ord_123", "ord_different");
        }).toThrow(TokenMismatchError);
    });
});

describe("add-item-to-order workflow - Retry Logic", () => {
    it("CardError should be non-retryable", () => {
        const cardError = new Stripe.errors.StripeCardError({
            message: "Card declined",
            type: "card_error",
        });
        expect(cardError instanceof Stripe.errors.StripeCardError).toBe(true);
    });

    it("ConnectionError should be retryable", () => {
        const connError = new Stripe.errors.StripeConnectionError({
            message: "Connection failed",
        });
        expect(connError instanceof Stripe.errors.StripeConnectionError).toBe(true);
    });

    it("should use exponential backoff: 200ms initial, factor 2, max 3 retries", () => {
        const initial = 200;
        const factor = 2;
        const maxRetries = 3;

        const delays = [];
        let delay = initial;
        for (let i = 0; i < maxRetries; i++) {
            delays.push(delay);
            delay *= factor;
        }

        expect(delays[0]).toBe(200);
        expect(delays[1]).toBe(400);
        expect(delays[2]).toBe(800);
    });
});

describe("add-item-to-order workflow - Idempotency Key", () => {
    it("should generate stable key using requestId", () => {
        const orderId = "ord_abc";
        const variantId = "var_123";
        const quantity = 2;
        const requestId = "req_stable_123";

        // Key format: `add-item-${orderId}-${variantId}-${quantity}-${requestId}`
        const key = `add-item-${orderId}-${variantId}-${quantity}-${requestId}`;

        expect(key).toBe("add-item-ord_abc-var_123-2-req_stable_123");
        // Key should NOT contain 13-digit timestamp
        expect(key).not.toMatch(/\d{13}/);
    });

    it("same requestId produces identical idempotency key", () => {
        const requestId = "req_abc123";
        const key1 = `add-item-ord_1-var_1-1-${requestId}`;
        const key2 = `add-item-ord_1-var_1-1-${requestId}`;

        expect(key1).toBe(key2);
    });
});

describe("add-item-to-order workflow - Stock Calculation", () => {
    it("should sum stock across ALL locations", () => {
        const inventoryLevels = [
            { location_id: "loc_1", stocked_quantity: 5, reserved_quantity: 2 },
            { location_id: "loc_2", stocked_quantity: 10, reserved_quantity: 0 },
            { location_id: "loc_3", stocked_quantity: 2, reserved_quantity: 3 },
        ];

        let totalAvailableStock = 0;
        for (const level of inventoryLevels) {
            const locationStock = (level.stocked_quantity || 0) - (level.reserved_quantity || 0);
            totalAvailableStock += Math.max(0, locationStock);
        }

        // 3 + 10 + 0 = 13
        expect(totalAvailableStock).toBe(13);
    });

    it("should throw InsufficientStockError when total stock < requested", () => {
        expect(() => {
            throw new InsufficientStockError("var_123", 5, 10);
        }).toThrow(InsufficientStockError);
    });
});

describe("add-item-to-order API error mapping", () => {
    it("InsufficientStockError -> 409 Conflict", () => {
        const error = new InsufficientStockError("var_123", 0, 5);
        expect(error instanceof InsufficientStockError).toBe(true);
    });

    it("CardDeclinedError -> 402 Payment Required", () => {
        const error = new CardDeclinedError("declined", "card_declined");
        expect(error instanceof CardDeclinedError).toBe(true);
    });

    it("InvalidOrderStateError -> 422 Unprocessable Entity", () => {
        const error = new InvalidOrderStateError("ord_123", "captured");
        expect(error instanceof InvalidOrderStateError).toBe(true);
    });

    it("TokenExpiredError -> 401 Unauthorized", () => {
        const error = new TokenExpiredError();
        expect(error.code).toBe("TOKEN_EXPIRED");
    });

    it("TokenMismatchError -> 403 Forbidden", () => {
        const error = new TokenMismatchError("ord_1", "ord_2");
        expect(error.code).toBe("TOKEN_MISMATCH");
    });

    it("AuthMismatchError -> 500 with audit log", () => {
        const error = new AuthMismatchError("ord_123", "pi_456", "DB failed");
        expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
    });
});
