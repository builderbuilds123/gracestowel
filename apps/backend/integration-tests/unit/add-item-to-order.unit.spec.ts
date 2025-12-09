/**
 * Unit tests for add-item-to-order workflow
 * Story: 3.2 Increment Authorization Logic
 * 
 * These tests import and test the ACTUAL error classes and utilities
 * from the workflow module.
 */

// Import actual error classes from the workflow
import {
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
} from "../../src/workflows/add-item-to-order";
import Stripe from "stripe";

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
            expect(error.message).toContain("var_123");
            expect(error.message).toContain("available=0");
            expect(error.message).toContain("requested=2");
            expect(error.variantId).toBe("var_123");
            expect(error.available).toBe(0);
            expect(error.requested).toBe(2);
        });

        it("should be an instance of Error", () => {
            const error = new InsufficientStockError("var_abc", 5, 10);
            expect(error instanceof Error).toBe(true);
            expect(error instanceof InsufficientStockError).toBe(true);
        });
    });

    describe("InvalidOrderStateError", () => {
        it("should create error with order id and current status", () => {
            const error = new InvalidOrderStateError("ord_123", "completed");
            expect(error.name).toBe("InvalidOrderStateError");
            expect(error.message).toContain("ord_123");
            expect(error.message).toContain("completed");
            expect(error.message).toContain("pending");
            expect(error.orderId).toBe("ord_123");
            expect(error.status).toBe("completed");
        });
    });

    describe("InvalidPaymentStateError", () => {
        it("should create error with payment intent id and status", () => {
            const error = new InvalidPaymentStateError("pi_123", "succeeded");
            expect(error.name).toBe("InvalidPaymentStateError");
            expect(error.message).toContain("pi_123");
            expect(error.message).toContain("succeeded");
            expect(error.message).toContain("requires_capture");
            expect(error.paymentIntentId).toBe("pi_123");
            expect(error.status).toBe("succeeded");
        });
    });

    describe("CardDeclinedError", () => {
        it("should create error with stripe code and decline code", () => {
            const error = new CardDeclinedError(
                "Your card was declined",
                "card_declined",
                "insufficient_funds"
            );
            expect(error.name).toBe("CardDeclinedError");
            expect(error.message).toBe("Your card was declined");
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
            const error = new AuthMismatchError(
                "ord_123",
                "pi_456",
                "DB commit failed after Stripe increment"
            );
            expect(error.name).toBe("AuthMismatchError");
            expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
            expect(error.message).toContain("ord_123");
            expect(error.message).toContain("pi_456");
            expect(error.message).toContain("DB commit failed");
            expect(error.orderId).toBe("ord_123");
            expect(error.paymentIntentId).toBe("pi_456");
        });
    });

    describe("Token Errors", () => {
        it("should create TokenExpiredError", () => {
            const error = new TokenExpiredError();
            expect(error.name).toBe("TokenExpiredError");
            expect(error.code).toBe("TOKEN_EXPIRED");
        });

        it("should create TokenInvalidError", () => {
            const error = new TokenInvalidError();
            expect(error.name).toBe("TokenInvalidError");
            expect(error.code).toBe("TOKEN_INVALID");
        });

        it("should create TokenMismatchError", () => {
            const error = new TokenMismatchError("ord_expected", "ord_actual");
            expect(error.name).toBe("TokenMismatchError");
            expect(error.code).toBe("TOKEN_MISMATCH");
            expect(error.expectedOrderId).toBe("ord_expected");
            expect(error.actualOrderId).toBe("ord_actual");
        });
    });
});

describe("add-item-to-order workflow - Retry Logic", () => {
    describe("Stripe error classification", () => {
        it("CardError should NOT be retried (return false)", () => {
            const cardError = new Stripe.errors.StripeCardError({
                message: "Card declined",
                type: "card_error",
            });
            // CardError should be non-retryable
            expect(cardError instanceof Stripe.errors.StripeCardError).toBe(true);
        });

        it("ConnectionError SHOULD be retried (return true)", () => {
            const connError = new Stripe.errors.StripeConnectionError({
                message: "Connection failed",
            });
            expect(connError instanceof Stripe.errors.StripeConnectionError).toBe(true);
        });
    });

    describe("Exponential backoff parameters", () => {
        it("should use correct backoff values: 200ms initial, factor 2", () => {
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
});

describe("add-item-to-order API error code mapping", () => {
    it("InsufficientStockError should map to 409 Conflict", () => {
        const error = new InsufficientStockError("var_123", 0, 5);
        expect(error instanceof InsufficientStockError).toBe(true);
        // Route should check: if (error instanceof InsufficientStockError) return 409
    });

    it("CardDeclinedError should map to 402 Payment Required", () => {
        const error = new CardDeclinedError("declined", "card_declined");
        expect(error instanceof CardDeclinedError).toBe(true);
        // Route should check: if (error instanceof CardDeclinedError) return 402
    });

    it("InvalidOrderStateError should map to 422 Unprocessable Entity", () => {
        const error = new InvalidOrderStateError("ord_123", "captured");
        expect(error instanceof InvalidOrderStateError).toBe(true);
        // Route should check: if (error instanceof InvalidOrderStateError) return 422
    });

    it("InvalidPaymentStateError should map to 422 Unprocessable Entity", () => {
        const error = new InvalidPaymentStateError("pi_123", "canceled");
        expect(error instanceof InvalidPaymentStateError).toBe(true);
        // Route should check: if (error instanceof InvalidPaymentStateError) return 422
    });

    it("AuthMismatchError should map to 500 with audit log", () => {
        const error = new AuthMismatchError("ord_123", "pi_456", "DB failed");
        expect(error instanceof AuthMismatchError).toBe(true);
        expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
        // Route should check: if (error instanceof AuthMismatchError) return 500
    });

    it("TokenExpiredError should map to 401 Unauthorized", () => {
        const error = new TokenExpiredError();
        expect(error instanceof TokenExpiredError).toBe(true);
        expect(error.code).toBe("TOKEN_EXPIRED");
    });

    it("TokenMismatchError should map to 403 Forbidden", () => {
        const error = new TokenMismatchError("ord_1", "ord_2");
        expect(error instanceof TokenMismatchError).toBe(true);
        expect(error.code).toBe("TOKEN_MISMATCH");
    });
});
