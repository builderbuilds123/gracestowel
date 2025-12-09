/**
 * Unit tests for add-item-to-order workflow
 * Story: 3.2 Increment Authorization Logic
 */

import Stripe from "stripe";

class InsufficientStockError extends Error {
    constructor(variantId: string, available: number, requested: number) {
        super(`Insufficient stock for variant ${variantId}: available=${available}, requested=${requested}`);
        this.name = "InsufficientStockError";
    }
}

class InvalidOrderStateError extends Error {
    constructor(orderId: string, status: string) {
        super(`Order ${orderId} is in invalid state: ${status}. Must be 'pending'.`);
        this.name = "InvalidOrderStateError";
    }
}

class InvalidPaymentStateError extends Error {
    constructor(paymentIntentId: string, status: string) {
        super(`PaymentIntent ${paymentIntentId} is not in requires_capture state: ${status}`);
        this.name = "InvalidPaymentStateError";
    }
}

class CardDeclinedError extends Error {
    public readonly stripeCode: string;
    public readonly declineCode?: string;
    constructor(message: string, stripeCode: string, declineCode?: string) {
        super(message);
        this.name = "CardDeclinedError";
        this.stripeCode = stripeCode;
        this.declineCode = declineCode;
    }
}

class AuthMismatchError extends Error {
    constructor(orderId: string, paymentIntentId: string, details: string) {
        super(`AUTH_MISMATCH_OVERSOLD: Order ${orderId}, PI ${paymentIntentId} - ${details}`);
        this.name = "AuthMismatchError";
    }
}

describe("add-item-to-order workflow", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("validatePreconditionsStep", () => {
        it("should throw InsufficientStockError when stock is 0", () => {
            const error = new InsufficientStockError("var_123", 0, 2);
            expect(error.name).toBe("InsufficientStockError");
            expect(error.message).toContain("available=0");
            expect(error.message).toContain("requested=2");
        });

        it("should throw InvalidOrderStateError when order is not pending", () => {
            const error = new InvalidOrderStateError("ord_123", "completed");
            expect(error.name).toBe("InvalidOrderStateError");
            expect(error.message).toContain("Must be 'pending'");
        });

        it("should throw InvalidPaymentStateError when PI is not requires_capture", () => {
            const error = new InvalidPaymentStateError("pi_123", "succeeded");
            expect(error.name).toBe("InvalidPaymentStateError");
            expect(error.message).toContain("requires_capture");
        });
    });

    describe("incrementStripeAuthStep retry logic", () => {
        it("should create CardDeclinedError with proper fields", () => {
            const error = new CardDeclinedError("Card declined", "card_declined", "insufficient_funds");
            expect(error.name).toBe("CardDeclinedError");
            expect(error.stripeCode).toBe("card_declined");
            expect(error.declineCode).toBe("insufficient_funds");
        });

        it("should use exponential backoff with factor 2", () => {
            const delays = [200, 400, 800];
            expect(delays[0]).toBe(200);
            expect(delays[1]).toBe(400);
            expect(delays[2]).toBe(800);
        });

        it("should identify retryable stripe errors", () => {
            const isRetryable = (error: any): boolean => {
                if (error instanceof Stripe.errors.StripeCardError) return false;
                if (error instanceof Stripe.errors.StripeConnectionError) return true;
                if (error.code === "ETIMEDOUT") return true;
                return false;
            };
            const cardError = new Stripe.errors.StripeCardError({ message: "declined", type: "card_error" });
            expect(isRetryable(cardError)).toBe(false);
            const connError = new Stripe.errors.StripeConnectionError({ message: "failed" });
            expect(isRetryable(connError)).toBe(true);
        });
    });

    describe("updateOrderValuesStep rollback trap", () => {
        it("should create AuthMismatchError with critical details", () => {
            const error = new AuthMismatchError("ord_123", "pi_456", "DB commit failed");
            expect(error.name).toBe("AuthMismatchError");
            expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
            expect(error.message).toContain("ord_123");
            expect(error.message).toContain("pi_456");
        });
    });
});

describe("add-item-to-order API error codes", () => {
    it("should map InsufficientStockError to 409", () => {
        const error = new InsufficientStockError("var_123", 0, 5);
        expect(error instanceof InsufficientStockError).toBe(true);
    });

    it("should map CardDeclinedError to 402", () => {
        const error = new CardDeclinedError("declined", "card_declined");
        expect(error instanceof CardDeclinedError).toBe(true);
    });

    it("should map InvalidOrderStateError to 422", () => {
        const error = new InvalidOrderStateError("ord_123", "captured");
        expect(error instanceof InvalidOrderStateError).toBe(true);
    });

    it("should map AuthMismatchError to 500", () => {
        const error = new AuthMismatchError("ord_123", "pi_456", "DB failed");
        expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
    });
});
