/**
 * Unit tests for Stripe Event Queue
 * Story 6.1: Webhook Validation & Retry
 * 
 * Tests:
 * - AC 5-6: Event queueing and retry on failure
 * - AC 7: Queue configuration (attempts: 5, exponential backoff)
 * - AC 8: Redis-based idempotency deduplication
 */

import { Job } from "bullmq";

// Mock ioredis before importing the module
const mockRedisExists = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisQuit = jest.fn();

jest.mock("ioredis", () => {
    // Mock the default export which is the Redis class
    return jest.fn().mockImplementation(() => ({
        exists: mockRedisExists,
        set: mockRedisSet,
        get: mockRedisGet,
        del: mockRedisDel,
        quit: mockRedisQuit,
    }));
});

// Mock bullmq
const mockQueueAdd = jest.fn();
const mockQueueClose = jest.fn();
jest.mock("bullmq", () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: mockQueueAdd,
        close: mockQueueClose,
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn(),
    })),
}));

// Import after mocks are set up
import {
    isEventProcessed,
    markEventProcessed,
    acquireProcessingLock,
    releaseProcessingLock,
    queueStripeEvent,
    getStripeEventQueue,
    processStripeEvent,
    resetStripeEventQueue,
    STRIPE_EVENT_QUEUE,
} from "../../src/lib/stripe-event-queue";
import Stripe from "stripe";

describe("Stripe Event Queue - Story 6.1", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisExists.mockReset();
        mockRedisSet.mockReset();
        mockRedisGet.mockReset();
        mockRedisDel.mockReset();
        mockRedisQuit.mockReset();
        mockQueueAdd.mockReset();
        mockQueueClose.mockReset();

        resetStripeEventQueue();
        process.env = { ...originalEnv };
        process.env.REDIS_URL = "redis://localhost:6379";

        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe("Redis-based Idempotency (AC 8)", () => {
        it("should return false for unprocessed events", async () => {
            mockRedisGet.mockResolvedValue(null);

            const result = await isEventProcessed("evt_new_123");

            expect(result).toBe(false);
            expect(mockRedisGet).toHaveBeenCalledWith("stripe:processed:evt_new_123");
        });

        it("should return true for already processed events", async () => {
            mockRedisGet.mockResolvedValue("processed");

            const result = await isEventProcessed("evt_processed_123");

            expect(result).toBe(true);
            expect(mockRedisGet).toHaveBeenCalledWith("stripe:processed:evt_processed_123");
        });

        it("should mark event as processed with 24h TTL", async () => {
            mockRedisSet.mockResolvedValue("OK");

            await markEventProcessed("evt_mark_123");

            expect(mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_mark_123",
                "processed",
                "EX",
                86400 // 24 hours in seconds
            );
        });

        it("should fail-open if Redis is unavailable (allow processing)", async () => {
            mockRedisGet.mockRejectedValue(new Error("Redis connection failed"));

            const result = await isEventProcessed("evt_redis_down");

            // Should return false to allow processing (fail-open for availability)
            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalled();
        });

        it("should not throw if marking fails (graceful degradation)", async () => {
            mockRedisSet.mockRejectedValue(new Error("Redis write failed"));

            // Should not throw (handled in implementation)
            await expect(markEventProcessed("evt_mark_fail")).resolves.not.toThrow();
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("Event Queueing (AC 5-7)", () => {
        it("should queue event with correct job data", async () => {
            mockRedisGet.mockResolvedValue(null);
            mockRedisSet.mockResolvedValue("OK"); // Mock successful lock acquisition
            mockQueueAdd.mockResolvedValue({ id: "evt_123" });

            const event: Stripe.Event = {
                id: "evt_123",
                type: "payment_intent.succeeded",
                data: { object: { id: "pi_123" } },
            } as any;

            const job = await queueStripeEvent(event);

            expect(mockQueueAdd).toHaveBeenCalledWith(
                "event-evt_123",
                expect.objectContaining({
                    eventId: "evt_123",
                    eventType: "payment_intent.succeeded",
                    eventData: event,
                    receivedAt: expect.any(Number),
                }),
                expect.objectContaining({
                    jobId: "evt_123",
                })
            );
            expect(job).toBeTruthy();
        });

        it("should skip queueing for already processed events", async () => {
            mockRedisGet.mockResolvedValue("processed");

            const event: Stripe.Event = {
                id: "evt_duplicate",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            const job = await queueStripeEvent(event);

            expect(job).toBeNull();
            expect(mockQueueAdd).not.toHaveBeenCalled();
        });

        it("should use event.id as job ID for BullMQ deduplication", async () => {
            mockRedisGet.mockResolvedValue(null);
            mockRedisSet.mockResolvedValue("OK"); // Mock successful lock
            mockQueueAdd.mockResolvedValue({ id: "evt_dedup_123" });

            const event: Stripe.Event = {
                id: "evt_dedup_123",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            await queueStripeEvent(event);

            expect(mockQueueAdd).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({ jobId: "evt_dedup_123" })
            );
        });

        it("should release processing lock if enqueue fails", async () => {
            mockRedisGet.mockResolvedValue(null);
            mockRedisSet.mockResolvedValue("OK");
            mockQueueAdd.mockRejectedValue(new Error("Queue down"));

            const event: Stripe.Event = {
                id: "evt_enqueue_fail",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            // releaseProcessingLock() checks GET then DEL when value is "processing"
            mockRedisGet.mockResolvedValueOnce(null); // acquireProcessingLock: not processed
            mockRedisGet.mockResolvedValueOnce("processing"); // releaseProcessingLock: still processing
            mockRedisDel.mockResolvedValue(1);

            await expect(queueStripeEvent(event)).rejects.toThrow("Queue down");
            expect(mockRedisDel).toHaveBeenCalledWith("stripe:processed:evt_enqueue_fail");
        });
    });

    describe("Queue Configuration (AC 7)", () => {
        it("should create queue with correct retry configuration", () => {
            const { Queue } = require("bullmq");
            
            getStripeEventQueue();

            expect(Queue).toHaveBeenCalledWith(
                STRIPE_EVENT_QUEUE,
                expect.objectContaining({
                    defaultJobOptions: expect.objectContaining({
                        attempts: 5,
                        backoff: {
                            type: "exponential",
                            delay: 1000,
                        },
                    }),
                })
            );
        });

        it("should configure job retention for DLQ analysis", () => {
            const { Queue } = require("bullmq");
            
            resetStripeEventQueue();
            getStripeEventQueue();

            expect(Queue).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    defaultJobOptions: expect.objectContaining({
                        removeOnFail: expect.objectContaining({
                            age: 7 * 24 * 60 * 60, // 7 days
                        }),
                    }),
                })
            );
        });
    });

    describe("Event Processing (AC 5-6)", () => {
        it("should mark event as processed after successful handling", async () => {
            mockRedisSet.mockResolvedValue("OK");

            await markEventProcessed("evt_success");

            expect(mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_success",
                "processed",
                "EX",
                86400
            );
        });

        it("should use shorter TTL for processing lock than for processed marker", async () => {
            mockRedisGet.mockResolvedValue(null); // Not already processed
            mockRedisSet.mockResolvedValue("OK");
            
            await acquireProcessingLock("evt_lock_test");
            
            // Verify set was called with NX flag and shorter TTL (10 min = 600s)
            expect(mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_lock_test",
                "processing",
                "EX",
                600, // 10 minutes - shorter than 24h processed TTL
                "NX"
            );
        });

        it("should not acquire lock if event already processed", async () => {
            mockRedisGet.mockResolvedValue("processed");
            
            const result = await acquireProcessingLock("evt_already_done");
            
            expect(result).toBe(false);
            expect(mockRedisSet).not.toHaveBeenCalled();
        });
    });

    describe("Lock Release on Failure", () => {
        it("should release lock when event permanently fails", async () => {
            mockRedisGet.mockResolvedValue("processing");
            mockRedisDel.mockResolvedValue(1);
            
            await releaseProcessingLock("evt_failed");

            expect(mockRedisDel).toHaveBeenCalledWith("stripe:processed:evt_failed");
        });

        it("should not release lock if event was successfully processed", async () => {
            mockRedisGet.mockResolvedValue("processed");
            
            await releaseProcessingLock("evt_success");

            expect(mockRedisDel).not.toHaveBeenCalled();
        });
    });
});
