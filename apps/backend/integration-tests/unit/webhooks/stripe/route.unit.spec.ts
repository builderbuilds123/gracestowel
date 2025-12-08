/**
 * Unit tests for Stripe webhook route
 * 
 * Tests webhook signature verification and event handling
 */

// Create shared mock functions at module level (before jest.mock calls)
const mockConstructEvent = jest.fn();
const mockWorkflowRun = jest.fn();

// Mock getStripeClient from utils/stripe
jest.mock("../../../../src/utils/stripe", () => ({
    getStripeClient: jest.fn(() => ({
        webhooks: {
            constructEvent: mockConstructEvent,
        },
    })),
    resetStripeClient: jest.fn(),
    STRIPE_API_VERSION: "2025-10-29.clover",
}));

// Mock Workflow
jest.mock("../../../../src/workflows/create-order-from-stripe", () => ({
    createOrderFromStripeWorkflow: jest.fn(() => ({
        run: mockWorkflowRun
    }))
}));

import { POST } from "../../../../src/api/webhooks/stripe/route";
import { createOrderFromStripeWorkflow } from "../../../../src/workflows/create-order-from-stripe";
import { resetStripeClient } from "../../../../src/utils/stripe";

describe("Stripe Webhook POST", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        resetStripeClient(); // Clear singleton cache to ensure mock is used
        process.env = { ...originalEnv };
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
        process.env.STRIPE_SECRET_KEY = "sk_test_key";

        // Reset mock implementations to defaults
        mockConstructEvent.mockReset();
        mockWorkflowRun.mockReset().mockResolvedValue({ result: { id: "order_123" } });

        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it("should return 500 if STRIPE_WEBHOOK_SECRET is missing", async () => {
        delete process.env.STRIPE_WEBHOOK_SECRET;

        const req = {
            headers: { "stripe-signature": "sig_123" },
            body: JSON.stringify({ id: "evt_123" }),
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: "Webhook secret not configured" })
        );
    });

    it("should return 400 if stripe-signature is missing", async () => {
        const req = {
            headers: {},
            body: JSON.stringify({ id: "evt_123" }),
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: "No signature provided" })
        );
    });

    it("should return 400 if signature verification fails", async () => {
        mockConstructEvent.mockImplementationOnce(() => {
            throw new Error("Invalid signature");
        });

        const req = {
            headers: { "stripe-signature": "sig_invalid" },
            body: JSON.stringify({ id: "evt_123" }),
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(mockConstructEvent).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: "Webhook Error: Invalid signature" })
        );
    });

    it("should skip order creation when cart_data is missing", async () => {
        const mockEvent = {
            type: "payment_intent.amount_capturable_updated",
            data: {
                object: {
                    id: "pi_no_cart",
                    amount_capturable: 1000,
                    amount: 1000,
                    currency: "usd",
                    status: "requires_capture",
                    metadata: { /* No cart_data */ }
                }
            }
        };
        mockConstructEvent.mockReturnValue(mockEvent);

        const req = {
            headers: { "stripe-signature": "sig_valid" },
            body: JSON.stringify({ id: "evt_no_cart" }),
            scope: { resolve: jest.fn() },
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(mockConstructEvent).toHaveBeenCalled();
        expect(createOrderFromStripeWorkflow).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle payment_intent.payment_failed without error", async () => {
        const mockEvent = {
            type: "payment_intent.payment_failed",
            data: {
                object: {
                    id: "pi_fail_123",
                    last_payment_error: { message: "Card declined" }
                }
            }
        };
        mockConstructEvent.mockReturnValue(mockEvent);

        const req = {
            headers: { "stripe-signature": "sig_valid" },
            body: JSON.stringify({ id: "evt_fail" }),
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(mockConstructEvent).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 and process event if signature is valid", async () => {
        const mockEvent = {
            type: "payment_intent.amount_capturable_updated",
            data: {
                object: {
                    id: "pi_123",
                    amount: 1000,
                    currency: "usd",
                    status: "requires_capture",
                    metadata: { cart_data: "{}" }
                }
            }
        };
        mockConstructEvent.mockReturnValue(mockEvent);

        const req = {
            headers: { "stripe-signature": "sig_valid" },
            body: JSON.stringify({ id: "evt_123" }),
            scope: { resolve: jest.fn() },
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(mockConstructEvent).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it("should trigger createOrderFromStripeWorkflow on payment_intent.amount_capturable_updated", async () => {
        const mockEvent = {
            type: "payment_intent.amount_capturable_updated",
            data: {
                object: {
                    id: "pi_auth_123",
                    amount_capturable: 1000,
                    amount: 1000,
                    currency: "usd",
                    status: "requires_capture",
                    metadata: {
                        cart_data: "{}",
                        customer_email: "test@example.com"
                    }
                }
            }
        };
        mockConstructEvent.mockReturnValue(mockEvent);
        mockWorkflowRun.mockResolvedValue({
            result: {
                id: "order_123",
                modification_token: "token_123",
                status: "pending"
            }
        });

        const req = {
            headers: { "stripe-signature": "sig_valid" },
            body: JSON.stringify({ id: "evt_auth_123" }),
            scope: { resolve: jest.fn() },
        } as any;

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;

        await POST(req, res);

        expect(mockConstructEvent).toHaveBeenCalled();
        expect(createOrderFromStripeWorkflow).toHaveBeenCalled();
        expect(mockWorkflowRun).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    paymentIntentId: "pi_auth_123",
                    amount: 1000
                })
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
