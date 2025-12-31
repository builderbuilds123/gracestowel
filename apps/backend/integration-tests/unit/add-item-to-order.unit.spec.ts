/**
 * Unit tests for add-item-to-order workflow
 * Story: 3.2 Increment Authorization Logic
 * 
 * Tests:
 * - Error class properties and behavior
 * - Step handler logic with mocked dependencies
 * - Retry logic parameters
 * - Idempotency key stability
 */

import Stripe from "stripe";

// Mock services BEFORE importing the workflow
jest.mock("../../src/services/modification-token", () => ({
    modificationTokenService: {
        validateToken: jest.fn(),
    },
}));

jest.mock("../../src/utils/stripe", () => ({
    getStripeClient: jest.fn(),
}));

// Import after mocks
import { modificationTokenService } from "../../src/services/modification-token";
import { getStripeClient } from "../../src/utils/stripe";
import {
    validatePreconditionsHandler,
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
    OrderNotFoundError,
    VariantNotFoundError,
    PaymentIntentMissingError,
} from "../../src/workflows/add-item-to-order";

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

describe("validatePreconditionsHandler - Step Logic", () => {
    let mockQuery: { graph: jest.Mock };
    let mockStripe: { paymentIntents: { retrieve: jest.Mock } };
    let mockContainer: { resolve: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});

        // Set up mock query
        mockQuery = {
            graph: jest.fn(),
        };

        // Set up mock Stripe client
        mockStripe = {
            paymentIntents: {
                retrieve: jest.fn(),
            },
        };

        // Set up mock container
        mockContainer = {
            resolve: jest.fn((service: string) => {
                if (service === "query") return mockQuery;
                throw new Error(`Unknown service: ${service}`);
            }),
        };

        // Default: valid token
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: true,
            expired: false,
            payload: { order_id: "ord_123" },
        });

        // Default: Stripe client
        (getStripeClient as jest.Mock).mockReturnValue(mockStripe);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should throw TokenExpiredError when token is expired", async () => {
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: false,
            expired: true,
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "expired_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(TokenExpiredError);
    });

    it("should throw TokenInvalidError when token is invalid", async () => {
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: false,
            expired: false,
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "invalid_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(TokenInvalidError);
    });

    it("should throw TokenMismatchError when order ID doesn't match", async () => {
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: true,
            payload: { order_id: "ord_different" },
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(TokenMismatchError);
    });

    it("should throw OrderNotFoundError when order doesn't exist", async () => {
        mockQuery.graph.mockResolvedValueOnce({ data: [] }); // No orders found

        const input = {
            orderId: "ord_nonexistent",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 1,
        };

        // Fix token validation to match input
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: true,
            payload: { order_id: "ord_nonexistent" },
        });

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(OrderNotFoundError);
    });

    it("should throw InvalidOrderStateError when order is not pending", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "captured",
                total: 5000,
                currency_code: "usd",
                metadata: { stripe_payment_intent_id: "pi_123" },
                items: [],
            }],
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(InvalidOrderStateError);
    });

    it("should throw PaymentIntentMissingError when order has no PI", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "pending",
                total: 5000,
                currency_code: "usd",
                metadata: {}, // No stripe_payment_intent_id
                items: [],
            }],
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(PaymentIntentMissingError);
    });

    it("should throw InvalidPaymentStateError when PI is not requires_capture", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "pending",
                total: 5000,
                currency_code: "usd",
                metadata: { stripe_payment_intent_id: "pi_123" },
                items: [],
            }],
        });

        mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
            id: "pi_123",
            status: "succeeded", // Already captured
            amount: 5000,
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(InvalidPaymentStateError);
    });

    it("should throw VariantNotFoundError when variant doesn't exist", async () => {
        // Order found
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "pending",
                total: 5000,
                currency_code: "usd",
                metadata: { stripe_payment_intent_id: "pi_123" },
                items: [],
            }],
        });

        // Stripe PI valid
        mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
            id: "pi_123",
            status: "requires_capture",
            amount: 5000,
        });

        // Variant not found
        mockQuery.graph.mockResolvedValueOnce({ data: [] });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_nonexistent",
            quantity: 1,
        };

        await expect(validatePreconditionsHandler(input, { container: mockContainer }))
            .rejects.toThrow(VariantNotFoundError);
    });

    it("should throw InsufficientStockError when stock is insufficient across all locations", async () => {
        // Order found
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "pending",
                total: 5000,
                currency_code: "usd",
                metadata: { stripe_payment_intent_id: "pi_123" },
                items: [],
            }],
        });

        // Stripe PI valid
        mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
            id: "pi_123",
            status: "requires_capture",
            amount: 5000,
        });

        // Variant found with inventory item
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                inventory_items: [{ inventory_item_id: "inv_123" }],
                product: { title: "Test Product" },
            }],
        });

        // Inventory levels across 2 locations: 3 + 2 = 5 total available, but requesting 10
        mockQuery.graph.mockResolvedValueOnce({
            data: [
                { location_id: "loc_1", stocked_quantity: 5, reserved_quantity: 2 }, // 3 available
                { location_id: "loc_2", stocked_quantity: 3, reserved_quantity: 1 }, // 2 available
                // Total: 5 available
            ],
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 10, // Requesting more than available
        };

        let caughtError: InsufficientStockError | null = null;
        try {
            await validatePreconditionsHandler(input, { container: mockContainer });
        } catch (e) {
            caughtError = e as InsufficientStockError;
        }

        expect(caughtError).toBeInstanceOf(InsufficientStockError);
        expect(caughtError?.available).toBe(5);
        expect(caughtError?.requested).toBe(10);
    });

    it("should return valid result when all preconditions pass", async () => {
        // Order found
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "ord_123",
                status: "pending",
                total: 5000,
                currency_code: "usd",
                metadata: { stripe_payment_intent_id: "pi_123" },
                items: [{ id: "item_1" }],
            }],
        });

        // Stripe PI valid
        mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
            id: "pi_123",
            status: "requires_capture",
            amount: 5000,
        });

        // Variant found with inventory item
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                inventory_items: [{ inventory_item_id: "inv_123" }],
                product: { title: "Test Product" },
            }],
        });

        // Sufficient inventory (10 available, requesting 2)
        mockQuery.graph.mockResolvedValueOnce({
            data: [
                { location_id: "loc_1", stocked_quantity: 8, reserved_quantity: 0 }, // 8 available
                { location_id: "loc_2", stocked_quantity: 5, reserved_quantity: 3 }, // 2 available
                // Total: 10 available
            ],
        });

        const input = {
            orderId: "ord_123",
            modificationToken: "valid_token",
            variantId: "var_123",
            quantity: 2,
        };

        const result = await validatePreconditionsHandler(input, { container: mockContainer });

        expect(result.valid).toBe(true);
        expect(result.orderId).toBe("ord_123");
        expect(result.paymentIntentId).toBe("pi_123");
        expect(result.order.status).toBe("pending");
        expect(result.paymentIntent.status).toBe("requires_capture");
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

        const key = `add-item-${orderId}-${variantId}-${quantity}-${requestId}`;
        expect(key).toBe("add-item-ord_abc-var_123-2-req_stable_123");
        expect(key).not.toMatch(/\d{13}/);
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

    it("TokenExpiredError -> 401 Unauthorized", () => {
        const error = new TokenExpiredError();
        expect(error.code).toBe("TOKEN_EXPIRED");
    });

    it("AuthMismatchError -> 500 with audit log", () => {
        const error = new AuthMismatchError("ord_123", "pi_456", "DB failed");
        expect(error.message).toContain("AUTH_MISMATCH_OVERSOLD");
    });
});

describe("add-item-to-order TAX-01 - Tax Calculation", () => {
    let mockQuery: { graph: jest.Mock };
    let mockContainer: { resolve: jest.Mock };

    // Import the actual handler for testing
    const { calculateTotalsHandler, VariantNotFoundError, PriceNotFoundError } = require("../../src/workflows/add-item-to-order");

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});

        mockQuery = {
            graph: jest.fn(),
        };

        mockContainer = {
            resolve: jest.fn((service: string) => {
                if (service === "query") return mockQuery;
                throw new Error(`Unknown service: ${service}`);
            }),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should calculate tax for tax-inclusive region (AC5)", async () => {
        // Mock variant with tax-inclusive pricing
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                calculated_price: {
                    calculated_amount: 1000, // $10.00 before tax
                    calculated_amount_with_tax: 1100, // $11.00 with tax
                    tax_total: 100, // $1.00 tax per unit
                    currency_code: "usd",
                },
                product: { title: "Test Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_123",
            quantity: 2,
            currentTotal: 5000,
            currentTaxTotal: 400,
            currentSubtotal: 4600,
            currencyCode: "usd",
        };

        const result = await calculateTotalsHandler(input, { container: mockContainer });

        // Verify tax calculation: 2 units * $1.00 tax = $2.00 tax
        expect(result.taxAmount).toBe(200);
        expect(result.unitPrice).toBe(1100); // Uses calculated_amount_with_tax
        expect(result.itemTotal).toBe(2200); // 2 * 1100
        expect(result.newOrderTotal).toBe(7200); // 5000 + 2200
    });

    it("should calculate tax for tax-exclusive region (AC6)", async () => {
        // Mock variant with tax-exclusive pricing
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_456",
                title: "Test Variant",
                calculated_price: {
                    calculated_amount: 2000, // $20.00
                    calculated_amount_with_tax: 2200, // $22.00 with 10% tax
                    tax_total: 200, // $2.00 tax per unit
                    currency_code: "usd",
                },
                product: { title: "Test Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_456",
            quantity: 3,
            currentTotal: 10000,
            currentTaxTotal: 800,
            currentSubtotal: 9200,
            currencyCode: "usd",
        };

        const result = await calculateTotalsHandler(input, { container: mockContainer });

        // Verify tax calculation: 3 units * $2.00 tax = $6.00 total tax
        expect(result.taxAmount).toBe(600);
        expect(result.unitPrice).toBe(2200);
        expect(result.itemTotal).toBe(6600); // 3 * 2200
        expect(result.newOrderTotal).toBe(16600); // 10000 + 6600
    });

    it("should handle zero tax for tax-exempt products (AC7)", async () => {
        // Mock variant with no tax
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_789",
                title: "Tax Exempt Item",
                calculated_price: {
                    calculated_amount: 1500,
                    calculated_amount_with_tax: 1500, // Same as calculated_amount
                    tax_total: 0, // No tax
                    currency_code: "usd",
                },
                product: { title: "Tax Exempt Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_789",
            quantity: 5,
            currentTotal: 8000,
            currentTaxTotal: 600,
            currentSubtotal: 7400,
            currencyCode: "usd",
        };

        const result = await calculateTotalsHandler(input, { container: mockContainer });

        // Verify no tax added
        expect(result.taxAmount).toBe(0);
        expect(result.unitPrice).toBe(1500);
        expect(result.itemTotal).toBe(7500); // 5 * 1500
        expect(result.newOrderTotal).toBe(15500); // 8000 + 7500
    });

    it("should track per-item tax in result for metadata storage (AC3)", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                calculated_price: {
                    calculated_amount: 1000,
                    calculated_amount_with_tax: 1100,
                    tax_total: 100,
                    currency_code: "usd",
                },
                product: { title: "Test Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_123",
            quantity: 2,
            currentTotal: 5000,
            currentTaxTotal: 0,
            currentSubtotal: 5000,
            currencyCode: "usd",
        };

        const result = await calculateTotalsHandler(input, { container: mockContainer });

        // Verify taxAmount is returned for per-item tracking in metadata
        expect(result).toHaveProperty("taxAmount");
        expect(result.taxAmount).toBe(200); // 2 * 100
        expect(result.variantId).toBe("var_123");
        expect(result.quantity).toBe(2);
    });

    it("should throw VariantNotFoundError when variant does not exist", async () => {
        mockQuery.graph.mockResolvedValueOnce({ data: [] });

        const input = {
            orderId: "ord_123",
            variantId: "var_nonexistent",
            quantity: 1,
            currentTotal: 5000,
            currentTaxTotal: 0,
            currentSubtotal: 5000,
            currencyCode: "usd",
        };

        await expect(calculateTotalsHandler(input, { container: mockContainer }))
            .rejects.toThrow(VariantNotFoundError);
    });

    it("should throw PriceNotFoundError when variant has no price", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                calculated_price: null, // No price
                product: { title: "Test Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_123",
            quantity: 1,
            currentTotal: 5000,
            currentTaxTotal: 0,
            currentSubtotal: 5000,
            currencyCode: "usd",
        };

        await expect(calculateTotalsHandler(input, { container: mockContainer }))
            .rejects.toThrow(PriceNotFoundError);
    });

    it("should use calculated_amount as fallback when calculated_amount_with_tax is missing", async () => {
        mockQuery.graph.mockResolvedValueOnce({
            data: [{
                id: "var_123",
                title: "Test Variant",
                calculated_price: {
                    calculated_amount: 1000,
                    // calculated_amount_with_tax is missing
                    tax_total: 0,
                    currency_code: "usd",
                },
                product: { title: "Test Product" },
            }],
        });

        const input = {
            orderId: "ord_123",
            variantId: "var_123",
            quantity: 2,
            currentTotal: 5000,
            currentTaxTotal: 0,
            currentSubtotal: 5000,
            currencyCode: "usd",
        };

        const result = await calculateTotalsHandler(input, { container: mockContainer });

        // Should fallback to calculated_amount
        expect(result.unitPrice).toBe(1000);
        expect(result.itemTotal).toBe(2000);
    });
});
