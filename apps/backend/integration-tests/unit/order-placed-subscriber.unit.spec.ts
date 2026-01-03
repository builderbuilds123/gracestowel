import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import orderPlacedHandler from "../../src/subscribers/order-placed";
import { enqueueEmail } from "../../src/lib/email-queue";

vi.mock("../../src/lib/email-queue", () => ({
  enqueueEmail: vi.fn(),
}));

vi.mock("../../src/lib/payment-capture-queue", () => ({
  schedulePaymentCapture: vi.fn(),
}));

vi.mock("../../src/utils/posthog", () => ({
  getPostHog: vi.fn().mockReturnValue(null),
}));

describe("Order Placed Subscriber", () => {
  let mockContainer: any;
  let mockLogger: any;
  let mockQuery: any;
  const originalEnv = process.env;
  let generateTokenSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.STOREFRONT_URL = "http://test-store.com";

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    // Create a mock service instance with generateToken spy
    const mockModificationTokenService = {
      generateToken: vi.fn().mockReturnValue("mock_token_123"),
    };

    generateTokenSpy = vi.spyOn(mockModificationTokenService, "generateToken");

    mockContainer = {
      resolve: vi.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "query") return mockQuery;
        if (key === "modificationTokenService") return mockModificationTokenService;
        return null;
      }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    generateTokenSpy.mockRestore();
  });

  const createQueryMock = (orderData: any) => {
    mockQuery = {
      graph: vi.fn().mockResolvedValue({
        data: [orderData]
      })
    };
  };

  it("generates magic link for guest orders with valid payment intent", async () => {
    const guestOrder = {
      id: "order_guest_1",
      display_id: "1001",
      email: "guest@example.com",
      currency_code: "usd",
      total: 5000,
      customer_id: null, // Guest
      created_at: new Date().toISOString(),
      items: [],
      payment_collections: [{
        payments: [{
          data: { id: "pi_123" }
        }]
      }]
    };
    createQueryMock(guestOrder);

    const event = { data: { id: "order_guest_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    expect(generateTokenSpy).toHaveBeenCalledWith(
      "order_guest_1",
      "pi_123",
      expect.any(Date)
    );

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "order-placed",
        data: expect.objectContaining({
          modification_token: "mock_token_123",
          order: expect.objectContaining({
            id: "order_guest_1"
          })
        })
      })
    );
  });

  it("does NOT generate magic link for registered customers", async () => {
    const registeredOrder = {
      id: "order_reg_1",
      display_id: "1002",
      email: "user@example.com",
      currency_code: "usd",
      total: 5000,
      customer_id: "cust_123", // Registered
      created_at: new Date().toISOString(),
      items: [],
      payment_collections: [{
        payments: [{
          data: { id: "pi_123" }
        }]
      }]
    };
    createQueryMock(registeredOrder);

    const event = { data: { id: "order_reg_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    expect(generateTokenSpy).not.toHaveBeenCalled();

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "order-placed",
        data: expect.objectContaining({
          modification_token: undefined,
          order: expect.objectContaining({
            id: "order_reg_1"
          })
        })
      })
    );
  });

  it("handles magic link generation failure gracefully and sanitizes PII", async () => {
    const guestOrder = {
      id: "order_fail_1",
      display_id: "1003",
      email: "fail@example.com",
      currency_code: "usd",
      total: 5000,
      customer_id: null,
      created_at: new Date().toISOString(),
      items: [],
      payment_collections: [{
        payments: [{
          data: { id: "pi_123" }
        }]
      }]
    };
    createQueryMock(guestOrder);

    // Mock error with PII
    generateTokenSpy.mockImplementationOnce(() => {
      throw new Error("Failed for user user@example.com because reason");
    });

    const event = { data: { id: "order_fail_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    // Expect warned logs with SANITIZED message
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[EMAIL\]\[WARN\] Failed to generate magic link for order order_fail_1: Failed for user \*\*\* because reason/)
    );

    // Should still enqueue email, just without modification token
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "order-placed",
        data: expect.objectContaining({
          modification_token: undefined,
          order: expect.objectContaining({
            id: "order_fail_1"
          })
        })
      })
    );
  });

  it("skips magic link generation if payment intent ID is missing", async () => {
    const guestOrderNoPayment = {
      id: "order_nopay_1",
      display_id: "1005",
      email: "guest@example.com",
      currency_code: "usd",
      total: 5000,
      customer_id: null,
      created_at: new Date().toISOString(),
      items: [],
      payment_collections: [] // No payments
    };
    createQueryMock(guestOrderNoPayment);

    const event = { data: { id: "order_nopay_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    // Ensure token generation was skipped
    expect(generateTokenSpy).not.toHaveBeenCalled();

    // Ensure warning logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not find payment intent ID for guest order")
    );

    // Email still sent
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "order-placed",
        data: expect.objectContaining({
          modification_token: undefined,
          order: expect.objectContaining({
            id: "order_nopay_1"
          })
        })
      })
    );
  });

  it("uses localhost fallback if STOREFRONT_URL is missing", async () => {
    delete process.env.STOREFRONT_URL;
    
    const guestOrder = {
      id: "order_local_1",
      display_id: "1006",
      email: "guest@example.com",
      currency_code: "usd",
      total: 5000,
      customer_id: null,
      created_at: new Date().toISOString(),
      items: [],
      payment_collections: [{
        payments: [{
          data: { id: "pi_123" }
        }]
      }]
    };
    createQueryMock(guestOrder);

    const event = { data: { id: "order_local_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("STOREFRONT_URL not set")
    );

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "order-placed",
        data: expect.objectContaining({
          modification_token: "mock_token_123",
          order: expect.objectContaining({
            id: "order_local_1"
          })
        })
      })
    );
  });

  it("catches enqueueEmail errors and logs them without throwing", async () => {
    const orderData = {
      id: "order_queue_fail",
      display_id: "1004",
      email: "test@example.com",
      items: [],
      payment_collections: []
    };
    createQueryMock(orderData);

    (enqueueEmail as any).mockRejectedValueOnce(new Error("Queue full"));

    const event = { data: { id: "order_queue_fail" } };
    
    // Should not throw
    await expect(orderPlacedHandler({ event, container: mockContainer } as any)).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("[EMAIL][ERROR] Failed to queue confirmation")
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Queue full")
    );
  });
});