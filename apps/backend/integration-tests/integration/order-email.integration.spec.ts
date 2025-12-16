import { startEmailWorker, shutdownEmailWorker } from "../../src/jobs/email-worker";
import { getEmailQueue, enqueueEmail } from "../../src/lib/email-queue";
import orderPlacedHandler from "../../src/subscribers/order-placed";
import { Queue, Worker } from "bullmq";
import { getRedisConnection } from "../../src/lib/redis";
import Redis from "ioredis";
import { modificationTokenService } from "../../src/services/modification-token";
import { shutdownPaymentCaptureQueue } from "../../src/lib/payment-capture-queue";

// NOTE: This test requires a running Redis instance
// Assuming we are in an environment where REDIS_URL points to a valid Redis

describe("End-to-End Email Flow Integration", () => {
  let container: any;
  let resendService: any;
  let logger: any;
  // let worker: Worker; // Managed by email-worker module
  let queue: Queue;
  let redisClient: Redis;
  let mockQuery: any;
  let mockOrderService: any;
  let mockModificationTokenService: any;

  beforeAll(async () => {
    // Check if we can connect to redis
    try {
        const connection = getRedisConnection();
        redisClient = new Redis(connection);
        await redisClient.ping();
    } catch (e) {
        console.warn("Skipping integration test because Redis is not available");
        return;
    }

    queue = getEmailQueue();
    // Clear queue
    await queue.obliterate({ force: true });
    await redisClient.del("email:dlq");

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    resendService = {
      send: jest.fn().mockResolvedValue({ id: "sent_e2e" }),
    };

    mockQuery = {
      graph: jest.fn()
    };
    
    mockOrderService = {
      updateOrders: jest.fn()
    };
    
    mockModificationTokenService = {
       generateToken: jest.fn().mockReturnValue("mock_token_integ")
    };

    container = {
      resolve: (key: string) => {
        if (key === "logger") return logger;
        if (key === "resendNotificationProviderService") return resendService;
        if (key === "query") return mockQuery;
        if (key === "order") return mockOrderService;
        if (key === "modificationTokenService") return mockModificationTokenService;
        return null;
      },
    };

    // Start worker
    startEmailWorker(container);
  });

  afterAll(async () => {
    await shutdownEmailWorker();
    await shutdownPaymentCaptureQueue();
    if (queue) await queue.close();
    if (redisClient) await redisClient.quit();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    if (redisClient) {
        await redisClient.del("email:dlq");
        await queue.drain();
    }
  });

  describe("Subscriber to Worker Wiring", () => {
    it("should process email when orderPlacedHandler is called", async () => {
        if (!redisClient) return;

        const orderId = `sub-test-${Date.now()}`;
        
        // Mock Query response for the order
        mockQuery.graph.mockResolvedValue({
            data: [{
                id: orderId,
                display_id: "9000",
                email: "integrated@example.com",
                currency_code: "usd",
                total: 9900,
                customer_id: "cust_1",
                created_at: new Date(),
                items: [{ title: "Integration Item", quantity: 1, unit_price: 9900 }],
                payment_collections: [{ payments: [{ data: { id: "pi_real" } }] }],
                metadata: { stripe_payment_intent_id: "pi_real" }
            }]
        });

        // Invoke the subscriber manually (simulating EventBus)
        await orderPlacedHandler({ 
            event: { data: { id: orderId } }, 
            container 
        } as any);

        // Wait for worker to process
        await new Promise(r => setTimeout(r, 2000));

        // Verify Resend was called
        expect(resendService.send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "integrated@example.com",
                template: "order_confirmation",
                data: expect.objectContaining({
                    orderNumber: "9000"
                })
            })
        );

        // Verify logger confirms queueing
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining("[EMAIL][QUEUE]")
        );
    });
  });

  describe("Guest Order Flow", () => {
    it("should queue email with magic link for guest order", async () => {
      if (!redisClient) return;

      const orderId = `guest-e2e-${Date.now()}`;

      // Simulate token generation logic which usually happens in subscriber
      // Ideally we would trigger the actual subscriber but mocking its dependencies fully in integration is hard.
      // So we test the component integration: Queue -> Worker -> Resend.

      // Manually generate token to simulate what subscriber does
      const token = modificationTokenService.generateToken(orderId, "pi_123");
      const magicLink = `http://localhost:5173/order/status/${orderId}?token=${token}`;

      await enqueueEmail({
        orderId,
        template: "order_confirmation",
        recipient: "guest@example.com",
        data: {
          orderNumber: "1001",
          items: [{ title: "Item 1", quantity: 1, unit_price: 1000 }],
          total: 1000,
          currency: "usd",
          isGuest: true,
          magicLink
        }
      });

      // Wait for completion
      await new Promise(r => setTimeout(r, 2000));

      const jobId = `email-${orderId}`;
      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      const state = await job!.getState();
      expect(state).toBe("completed");

      // Verify Resend call
      expect(resendService.send).toHaveBeenCalledWith(
        expect.objectContaining({
            to: "guest@example.com",
            template: "order_confirmation",
            data: expect.objectContaining({
                magicLink: expect.stringContaining("token="),
                isGuest: true
            })
        })
      );
    });
  });

  describe("Registered Customer Flow", () => {
    it("should queue email without magic link for registered customer", async () => {
      if (!redisClient) return;

      const orderId = `reg-e2e-${Date.now()}`;

      await enqueueEmail({
        orderId,
        template: "order_confirmation",
        recipient: "user@example.com",
        data: {
          orderNumber: "1002",
          items: [{ title: "Item 1", quantity: 1, unit_price: 1000 }],
          total: 1000,
          currency: "usd",
          isGuest: false,
          magicLink: null
        }
      });

      await new Promise(r => setTimeout(r, 2000));

      // Verify Resend call
      expect(resendService.send).toHaveBeenCalledWith(
        expect.objectContaining({
            to: "user@example.com",
            data: expect.objectContaining({
                magicLink: null,
                isGuest: false
            })
        })
      );
    });
  });

  describe("Failure Resilience", () => {
    it("should retry 3 times then move to DLQ on persistent failure", async () => {
      if (!redisClient) return;

      const orderId = `fail-e2e-${Date.now()}`;
      resendService.send.mockRejectedValue(new Error("API Error"));

      await enqueueEmail({
        orderId,
        template: "order_confirmation",
        recipient: "fail@example.com",
        data: {
            orderNumber: "1003",
            items: [],
            total: 100,
            currency: "usd"
        }
      });

      const jobId = `email-${orderId}`;

      const waitForJobState = async (state: string, timeoutMs: number) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
              const job = await queue.getJob(jobId);
              if (job && await job.getState() === state) {
                  return job;
              }
              await new Promise(r => setTimeout(r, 200));
          }
          return null;
      };

      // Wait for failure (retries + processing time ~ 7-8s)
      // Allow 12s
      const failedJob = await waitForJobState("failed", 12000);
      expect(failedJob).not.toBeNull();

      // Wait a bit for DLQ push
      await new Promise(r => setTimeout(r, 1000));

      const dlqItems = await redisClient.lrange("email:dlq", 0, -1);
      expect(dlqItems.length).toBeGreaterThan(0);

      const entry = JSON.parse(dlqItems[0]);
      expect(entry.orderId).toBe(orderId);
      expect(entry.attempts).toBe(3);

      // Check logs for alert
      expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining("[EMAIL][ALERT]")
      );
    }, 15000);
  });
});
