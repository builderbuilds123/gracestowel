import { describe, it, expect, vi } from "vitest";
import {
    DuplicateLineItemError,
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
    TaxProviderError,
    OrderNotFoundError,
    VariantNotFoundError,
    PaymentIntentMissingError,
    OrderLockedError,
    PriceNotFoundError,
    CurrencyMismatchError,
    mapDeclineCodeToUserMessage,
    RETRYABLE_DECLINE_CODES,
} from "../../src/workflows/add-item-to-order";

describe("add-item-to-order workflow - Error Classes & Utilities", () => {
    describe("Error Classes", () => {
        it("DuplicateLineItemError should have correct name and message", () => {
            const error = new DuplicateLineItemError("order_123", "var_456");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("DuplicateLineItemError");
            expect(error.message).toContain("Duplicate line item");
            expect(error.message).toContain("order_123");
            expect(error.message).toContain("var_456");
        });

        it("InsufficientStockError should have correct name", () => {
            const error = new InsufficientStockError("out of stock");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("InsufficientStockError");
        });

        it("InvalidOrderStateError should have correct name", () => {
            const error = new InvalidOrderStateError("bad state");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("InvalidOrderStateError");
        });

        it("InvalidPaymentStateError should have correct name", () => {
            const error = new InvalidPaymentStateError("bad payment");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("InvalidPaymentStateError");
        });

        it("CardDeclinedError should store decline code and user message", () => {
            // Constructor: (message, stripeCode, declineCode?)
            const error = new CardDeclinedError("declined", "card_declined", "insufficient_funds");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("CardDeclinedError");
            expect(error.declineCode).toBe("insufficient_funds");
            expect(error.userMessage).toBe("Insufficient funds.");
            expect(error.stripeCode).toBe("card_declined");
        });

        it("AuthMismatchError should have correct name", () => {
            const error = new AuthMismatchError("auth mismatch");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("AuthMismatchError");
        });

        it("TokenExpiredError should have correct name", () => {
            const error = new TokenExpiredError("expired");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("TokenExpiredError");
        });

        it("TokenInvalidError should have correct name", () => {
            const error = new TokenInvalidError("invalid");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("TokenInvalidError");
        });

        it("TokenMismatchError should have correct name", () => {
            const error = new TokenMismatchError("mismatch");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("TokenMismatchError");
        });

        it("TaxProviderError should have correct name", () => {
            const error = new TaxProviderError("tax error");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("TaxProviderError");
        });

        it("OrderNotFoundError should have correct name", () => {
            const error = new OrderNotFoundError("not found");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("OrderNotFoundError");
        });

        it("VariantNotFoundError should have correct name", () => {
            const error = new VariantNotFoundError("variant not found");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("VariantNotFoundError");
        });

        it("PaymentIntentMissingError should have correct name", () => {
            const error = new PaymentIntentMissingError("missing pi");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("PaymentIntentMissingError");
        });

        it("OrderLockedError should have correct name", () => {
            const error = new OrderLockedError("locked");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("OrderLockedError");
        });

        it("PriceNotFoundError should have correct name", () => {
            const error = new PriceNotFoundError("no price");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("PriceNotFoundError");
        });

        it("CurrencyMismatchError should have correct name", () => {
            const error = new CurrencyMismatchError("currency mismatch");
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe("CurrencyMismatchError");
        });
    });

    describe("mapDeclineCodeToUserMessage", () => {
        it("should return specific message for known decline code", () => {
            const message = mapDeclineCodeToUserMessage("insufficient_funds");
            expect(message).toBe("Insufficient funds.");
        });

        it("should return generic message for unknown decline code", () => {
            const message = mapDeclineCodeToUserMessage("unknown_code_xyz");
            expect(message).toBeTruthy();
            expect(typeof message).toBe("string");
        });

        it("should return generic message when no decline code provided", () => {
            const message = mapDeclineCodeToUserMessage(undefined);
            expect(message).toBeTruthy();
            expect(typeof message).toBe("string");
        });
    });

    describe("RETRYABLE_DECLINE_CODES", () => {
        it("should be a Set", () => {
            expect(RETRYABLE_DECLINE_CODES).toBeInstanceOf(Set);
        });

        it("should contain common retryable codes", () => {
            // At minimum, these should be considered retryable
            expect(RETRYABLE_DECLINE_CODES.size).toBeGreaterThan(0);
        });
    });
});
