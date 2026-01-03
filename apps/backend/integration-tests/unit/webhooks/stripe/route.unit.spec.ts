import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Unit tests for Stripe webhook route
 * 
 * Story 6.1: Webhook Validation & Retry
 * Tests:
 * - AC 1-4: Signature verification
 * - AC 5-7: Event queueing for async processing
 * - AC 8: Idempotency via Redis
 */

import { EventEmitter } from "events";

// Create shared mock functions at module level (before vi.mock calls)
const mockConstructEvent = vi.fn();
const mockQueueStripeEvent = vi.fn();
const mockIsEventProcessed = vi.fn();

// Mock getStripeClient from utils/stripe
vi.mock("../../../../src/utils/stripe", () => ({
    getStripeClient: vi.fn(() => ({
        webhooks: {
            constructEvent: mockConstructEvent,
        },
    })),
    resetStripeClient: vi.fn(),
    STRIPE_API_VERSION: "2025-10-29.clover",
}));

// Mock stripe-event-queue
vi.mock("../../../../src/lib/stripe-event-queue", () => ({
    isEventProcessed: vi.fn(),
    queueStripeEvent: vi.fn(),
}));

import { POST } from "../../../../src/api/webhooks/stripe/route";
import { resetStripeClient } from "../../../../src/utils/stripe";
import { isEventProcessed, queueStripeEvent } from "../../../../src/lib/stripe-event-queue";

/**
 * Create a mock request object that simulates a readable stream
 */
function createMockStreamRequest(options: {
    headers?: Record<string, string>;
    body?: string;
    scope?: { resolve: vi.Mock };
}): any {
    const emitter = new EventEmitter();
    const req = Object.assign(emitter, {
        headers: options.headers || {},
        scope: options.scope,
    });
    
    setImmediate(() => {
        if (options.body) {
            req.emit("data", Buffer.from(options.body));
        }
        req.emit("end");
    });
    
    return req;
}

describe("Stripe Webhook POST - Story 6.1", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        resetStripeClient();
        process.env = { ...originalEnv };
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
        process.env.STRIPE_SECRET_KEY = "sk_test_key";

        mockConstructEvent.mockReset();
        (isEventProcessed as any).mockReset().mockResolvedValue(false);
        (queueStripeEvent as any).mockReset().mockResolvedValue({ id: "job_123" });

        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe("Signature Verification (AC 1-4)", () => {
        it("should return 500 if STRIPE_WEBHOOK_SECRET is missing", async () => {
            delete process.env.STRIPE_WEBHOOK_SECRET;

            const req = {
                headers: { "stripe-signature": "sig_123" },
            } as any;

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Webhook secret not configured" });
        });

        it("should return 400 if stripe-signature header is missing", async () => {
            const req = {
                headers: {},
            } as any;

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "No signature provided" });
        });

        it("should return 400 if signature verification fails", async () => {
            mockConstructEvent.mockImplementationOnce(() => {
                throw new Error("Invalid signature");
            });

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_invalid" },
                body: JSON.stringify({ id: "evt_123" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(mockConstructEvent).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Webhook Error: Invalid signature" });
        });

        it("should verify signature using constructEvent with raw body", async () => {
            const mockEvent = { id: "evt_123", type: "payment_intent.succeeded", data: { object: {} } };
            mockConstructEvent.mockReturnValue(mockEvent);

            const rawBody = JSON.stringify({ id: "evt_123" });
            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: rawBody,
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, "sig_valid", "whsec_test");
        });

        it("should return 400 for malformed JSON body (poison message)", async () => {
            // Poison message test: malformed JSON body with valid signature headers
            // constructEvent will throw when parsing fails
            mockConstructEvent.mockImplementationOnce(() => {
                const error = new Error("Unexpected token in JSON");
                (error as any).type = "StripeSignatureVerificationError";
                throw error;
            });

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: "not-valid-json{{{malformed", // Malformed JSON
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            // Should return 400 (no retry) for malformed payloads
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ 
                error: expect.stringContaining("Webhook Error") 
            });
            // Should NOT queue the event
            expect(queueStripeEvent).not.toHaveBeenCalled();
        });
    });

    describe("Event Queueing (AC 5-7)", () => {
        it("should queue valid events for async processing", async () => {
            const mockEvent = {
                id: "evt_queue_123",
                type: "payment_intent.succeeded",
                data: { object: { id: "pi_123" } }
            };
            mockConstructEvent.mockReturnValue(mockEvent);
            (queueStripeEvent as any).mockResolvedValue({ id: "job_123" });

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_queue_123" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(queueStripeEvent).toHaveBeenCalledWith(mockEvent);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true });
        });

        it("should return 500 if queueing fails to trigger Stripe retry (AC5-6)", async () => {
            const mockEvent = {
                id: "evt_fail_queue",
                type: "payment_intent.succeeded",
                data: { object: {} }
            };
            mockConstructEvent.mockReturnValue(mockEvent);
            (queueStripeEvent as any).mockRejectedValue(new Error("Redis connection failed"));

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_fail_queue" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            // Should return 500 to trigger Stripe retry
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ 
                error: "Internal Server Error",
                eventId: "evt_fail_queue", // Included for correlation in logs
            });
            expect(console.error).toHaveBeenCalled();
        });

        it("should return 200 if job already exists (Stripe retry while pending)", async () => {
            const mockEvent = {
                id: "evt_already_queued",
                type: "payment_intent.succeeded",
                data: { object: {} }
            };
            mockConstructEvent.mockReturnValue(mockEvent);
            (queueStripeEvent as any).mockRejectedValue(new Error("Job evt_already_queued already exists"));

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_already_queued" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            // Should return 200 since job is already being processed
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true, alreadyQueued: true });
        });

        it("should return 200 immediately without waiting for processing", async () => {
            const mockEvent = {
                id: "evt_async_123",
                type: "payment_intent.amount_capturable_updated",
                data: { object: { id: "pi_123", status: "requires_capture" } }
            };
            mockConstructEvent.mockReturnValue(mockEvent);

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_async_123" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            // Route should return immediately after queueing
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true });
        });
    });

    describe("Idempotency (AC 8)", () => {
        it("should return 200 with duplicate flag for already processed events", async () => {
            (isEventProcessed as any).mockResolvedValue(true);

            const mockEvent = {
                id: "evt_duplicate_123",
                type: "payment_intent.succeeded",
                data: { object: {} }
            };
            mockConstructEvent.mockReturnValue(mockEvent);

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_duplicate_123" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(isEventProcessed).toHaveBeenCalledWith("evt_duplicate_123");
            expect(queueStripeEvent).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
        });

        it("should check idempotency before queueing", async () => {
            (isEventProcessed as any).mockResolvedValue(false);

            const mockEvent = {
                id: "evt_new_123",
                type: "payment_intent.succeeded",
                data: { object: {} }
            };
            mockConstructEvent.mockReturnValue(mockEvent);

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_new_123" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(isEventProcessed).toHaveBeenCalledWith("evt_new_123");
            expect(queueStripeEvent).toHaveBeenCalled();
        });

        it("should handle null job return (already queued)", async () => {
            const mockEvent = {
                id: "evt_already_queued",
                type: "payment_intent.succeeded",
                data: { object: {} }
            };
            mockConstructEvent.mockReturnValue(mockEvent);
            (queueStripeEvent as any).mockResolvedValue(null);

            const req = createMockStreamRequest({
                headers: { "stripe-signature": "sig_valid" },
                body: JSON.stringify({ id: "evt_already_queued" }),
            });

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as any;

            await POST(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });
    });
});
