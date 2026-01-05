import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    return {
        // Redis
        mockRedisExists: vi.fn(),
        mockRedisSet: vi.fn(),
        mockRedisGet: vi.fn(),
        mockRedisDel: vi.fn(),
        mockRedisQuit: vi.fn(),
        // BullMQ
        mockQueueAdd: vi.fn(),
        mockQueueClose: vi.fn(),
        mockWorkerOn: vi.fn(),
        mockWorkerClose: vi.fn(),
    };
});

import { Job } from "bullmq";

vi.mock("ioredis", () => {
    return {
        default: class RedisMock {
            constructor() {
                return {
                    exists: mocks.mockRedisExists,
                    set: mocks.mockRedisSet,
                    get: mocks.mockRedisGet,
                    del: mocks.mockRedisDel,
                    quit: mocks.mockRedisQuit,
                };
            }
        },
        Redis: class RedisMock {
            constructor() {
                return {
                    exists: mocks.mockRedisExists,
                    set: mocks.mockRedisSet,
                    get: mocks.mockRedisGet,
                    del: mocks.mockRedisDel,
                    quit: mocks.mockRedisQuit,
                };
            }
        }
    };
});

vi.mock("bullmq", () => {
    return {
        Queue: vi.fn(function() {
            return {
                add: mocks.mockQueueAdd,
                close: mocks.mockQueueClose,
            };
        }),
        Worker: vi.fn(function() {
            return {
                on: mocks.mockWorkerOn,
                close: mocks.mockWorkerClose,
            };
        })
    };
});

// Import after mocks are set up
import {
    isEventProcessed,
    markEventProcessed,
    acquireProcessingLock,
    releaseProcessingLock,
    queueStripeEvent,
    getStripeEventQueue,
    resetStripeEventQueue,
    STRIPE_EVENT_QUEUE,
} from "../../src/lib/stripe-event-queue";
import Stripe from "stripe";

describe("Stripe Event Queue - Story 6.1", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockRedisExists.mockReset();
        mocks.mockRedisSet.mockReset();
        mocks.mockRedisGet.mockReset();
        mocks.mockRedisDel.mockReset();
        mocks.mockRedisQuit.mockReset();
        mocks.mockQueueAdd.mockReset();
        mocks.mockQueueClose.mockReset();
        mocks.mockWorkerOn.mockReset();
        mocks.mockWorkerClose.mockReset();

        resetStripeEventQueue();
        process.env = { ...originalEnv };
        process.env.REDIS_URL = "redis://localhost:6379";

        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe("Redis-based Idempotency (AC 8)", () => {
        it("should return false for unprocessed events", async () => {
            mocks.mockRedisGet.mockResolvedValue(null);

            const result = await isEventProcessed("evt_new_123");

            expect(result).toBe(false);
            expect(mocks.mockRedisGet).toHaveBeenCalledWith("stripe:processed:evt_new_123");
        });

        it("should return true for already processed events", async () => {
            mocks.mockRedisGet.mockResolvedValue("processed");

            const result = await isEventProcessed("evt_processed_123");

            expect(result).toBe(true);
            expect(mocks.mockRedisGet).toHaveBeenCalledWith("stripe:processed:evt_processed_123");
        });

        it("should mark event as processed with 24h TTL", async () => {
            mocks.mockRedisSet.mockResolvedValue("OK");

            await markEventProcessed("evt_mark_123");

            expect(mocks.mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_mark_123",
                "processed",
                "EX",
                86400 // 24 hours in seconds
            );
        });

        it("should fail-open if Redis is unavailable (allow processing)", async () => {
            mocks.mockRedisGet.mockRejectedValue(new Error("Redis connection failed"));

            const result = await isEventProcessed("evt_redis_down");

            // Should return false to allow processing (fail-open for availability)
            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalled();
        });

        it("should not throw if marking fails (graceful degradation)", async () => {
            mocks.mockRedisSet.mockRejectedValue(new Error("Redis write failed"));

            // Should not throw (handled in implementation)
            await expect(markEventProcessed("evt_mark_fail")).resolves.not.toThrow();
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("Event Queueing (AC 5-7)", () => {
        it("should queue event with correct job data", async () => {
            mocks.mockRedisGet.mockResolvedValue(null);
            mocks.mockRedisSet.mockResolvedValue("OK"); // Mock successful lock acquisition
            mocks.mockQueueAdd.mockResolvedValue({ id: "evt_123" });

            const event: Stripe.Event = {
                id: "evt_123",
                type: "payment_intent.succeeded",
                data: { object: { id: "pi_123" } },
            } as any;

            const job = await queueStripeEvent(event);

            expect(mocks.mockQueueAdd).toHaveBeenCalledWith(
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
            mocks.mockRedisGet.mockResolvedValue("processed");

            const event: Stripe.Event = {
                id: "evt_duplicate",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            const job = await queueStripeEvent(event);

            expect(job).toBeNull();
            expect(mocks.mockQueueAdd).not.toHaveBeenCalled();
        });

        it("should use event.id as job ID for BullMQ deduplication", async () => {
            mocks.mockRedisGet.mockResolvedValue(null);
            mocks.mockRedisSet.mockResolvedValue("OK"); // Mock successful lock
            mocks.mockQueueAdd.mockResolvedValue({ id: "evt_dedup_123" });

            const event: Stripe.Event = {
                id: "evt_dedup_123",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            await queueStripeEvent(event);

            expect(mocks.mockQueueAdd).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({ jobId: "evt_dedup_123" })
            );
        });

        it("should release processing lock if enqueue fails", async () => {
            mocks.mockRedisGet.mockResolvedValue(null);
            mocks.mockRedisSet.mockResolvedValue("OK");
            mocks.mockQueueAdd.mockRejectedValue(new Error("Queue down"));

            const event: Stripe.Event = {
                id: "evt_enqueue_fail",
                type: "payment_intent.succeeded",
                data: { object: {} },
            } as any;

            // releaseProcessingLock() checks GET then DEL when value is "processing"
            mocks.mockRedisGet.mockResolvedValueOnce(null); // acquireProcessingLock: not processed
            mocks.mockRedisGet.mockResolvedValueOnce("processing"); // releaseProcessingLock: still processing
            mocks.mockRedisDel.mockResolvedValue(1);

            await expect(queueStripeEvent(event)).rejects.toThrow("Queue down");
            expect(mocks.mockRedisDel).toHaveBeenCalledWith("stripe:processed:evt_enqueue_fail");
        });
    });

    describe("Queue Configuration (AC 7)", () => {
        it("should create queue with correct retry configuration", async () => {
            // Re-import to trigger mock
            const { Queue } = await import("bullmq");
            
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

        it("should configure job retention for DLQ analysis", async () => {
            const { Queue } = await import("bullmq");
            
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
            mocks.mockRedisSet.mockResolvedValue("OK");

            await markEventProcessed("evt_success");

            expect(mocks.mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_success",
                "processed",
                "EX",
                86400
            );
        });

        it("should use shorter TTL for processing lock than for processed marker", async () => {
            mocks.mockRedisGet.mockResolvedValue(null); // Not already processed
            mocks.mockRedisSet.mockResolvedValue("OK");
            
            await acquireProcessingLock("evt_lock_test");
            
            // Verify set was called with NX flag and shorter TTL (10 min = 600s)
            expect(mocks.mockRedisSet).toHaveBeenCalledWith(
                "stripe:processed:evt_lock_test",
                "processing",
                "EX",
                600, // 10 minutes - shorter than 24h processed TTL
                "NX"
            );
        });

        it("should not acquire lock if event already processed", async () => {
            mocks.mockRedisGet.mockResolvedValue("processed");
            
            const result = await acquireProcessingLock("evt_already_done");
            
            expect(result).toBe(false);
            expect(mocks.mockRedisSet).not.toHaveBeenCalled();
        });
    });

    describe("Lock Release on Failure", () => {
        it("should release lock when event permanently fails", async () => {
            mocks.mockRedisGet.mockResolvedValue("processing");
            mocks.mockRedisDel.mockResolvedValue(1);
            
            await releaseProcessingLock("evt_failed");

            expect(mocks.mockRedisDel).toHaveBeenCalledWith("stripe:processed:evt_failed");
        });

        it("should not release lock if event was successfully processed", async () => {
            mocks.mockRedisGet.mockResolvedValue("processed");
            
            await releaseProcessingLock("evt_success");

            expect(mocks.mockRedisDel).not.toHaveBeenCalled();
        });
    });

    describe("Retry Exhaustion / DLQ Behavior (AC 5-7)", () => {
        let capturedFailedHandler: ((job: any, err: any) => Promise<void>) | null = null;
        
        beforeEach(async () => {
            vi.resetModules();
            
            vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(console, "error").mockImplementation(() => {});
            vi.spyOn(console, "warn").mockImplementation(() => {});
            
            const nestedMockWorkerOn = vi.fn().mockImplementation((event: string, handler: any) => {
                if (event === "failed") {
                    capturedFailedHandler = handler;
                }
            });
            
            // Nested mock must also reference hoisted mocks or provide new ones
            vi.doMock("bullmq", () => ({
                Queue: class QueueMock {
                    constructor() {
                        return { add: mocks.mockQueueAdd, close: mocks.mockQueueClose };
                    }
                },
                Worker: class WorkerMock {
                    constructor() {
                        return { on: nestedMockWorkerOn, close: mocks.mockWorkerClose };
                    }
                },
            }));

             vi.doMock("ioredis", () => {
                return {
                    default: class RedisMock {
                        constructor() {
                            return {
                                exists: mocks.mockRedisExists,
                                set: mocks.mockRedisSet,
                                get: mocks.mockRedisGet,
                                del: mocks.mockRedisDel,
                                quit: mocks.mockRedisQuit,
                            };
                        }
                    },
                    Redis: class RedisMock {
                        constructor() {
                             return {
                                exists: mocks.mockRedisExists,
                                set: mocks.mockRedisSet,
                                get: mocks.mockRedisGet,
                                del: mocks.mockRedisDel,
                                quit: mocks.mockRedisQuit,
                            };
                        }
                    }
                };
            });
        });
        
        it("should log CRITICAL error and release lock when job exhausts all retries", async () => {
            const { startStripeEventWorker } = await import("../../src/workers/stripe-event-worker");
            
            mocks.mockRedisGet.mockResolvedValue("processing");
            mocks.mockRedisDel.mockResolvedValue(1);
            
            const mockContainer = { resolve: vi.fn() } as any;
            const mockHandler = vi.fn();
            
            startStripeEventWorker(mockContainer, mockHandler);
            
            expect(capturedFailedHandler).not.toBeNull();
            
            const exhaustedJob = {
                id: "job_evt_exhausted",
                attemptsMade: 5,
                opts: { attempts: 5 },
                data: {
                    eventId: "evt_exhausted_123",
                    eventType: "payment_intent.succeeded",
                },
            };
            
            const testError = new Error("Permanent failure after 5 attempts");
            
            await capturedFailedHandler!(exhaustedJob, testError);
            
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("[CRITICAL][DLQ]"),
                expect.any(Error)
            );
            
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining("[METRIC] webhook_processing_failure_rate")
            );
            
            expect(mocks.mockRedisDel).toHaveBeenCalledWith("stripe:processed:evt_exhausted_123");
        });
        
        it("should only warn and not release lock for intermediate failures", async () => {
            const { startStripeEventWorker } = await import("../../src/workers/stripe-event-worker");
            
            const mockContainer = { resolve: vi.fn() } as any;
            const mockHandler = vi.fn();
            
            startStripeEventWorker(mockContainer, mockHandler);
            
            expect(capturedFailedHandler).not.toBeNull();
            
            const retryableJob = {
                id: "job_evt_retryable",
                attemptsMade: 2,
                opts: { attempts: 5 },
                data: {
                    eventId: "evt_retryable_123",
                    eventType: "payment_intent.succeeded",
                },
            };
            
            const testError = new Error("Temporary failure");
            
            await capturedFailedHandler!(retryableJob, testError);
            
            expect(console.error).not.toHaveBeenCalledWith(
                expect.stringContaining("[CRITICAL][DLQ]"),
                expect.anything()
            );
            
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining("will retry"),
                expect.any(Error)
            );
            
            expect(mocks.mockRedisDel).not.toHaveBeenCalled();
        });
    });
});
