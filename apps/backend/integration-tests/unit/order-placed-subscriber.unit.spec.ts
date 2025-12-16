import orderPlacedHandler from "../../src/subscribers/order-placed";
import { enqueueEmail } from "../../src/lib/email-queue";

jest.mock("../../src/lib/email-queue", () => ({
  enqueueEmail: jest.fn(),
}));

jest.mock("../../src/lib/payment-capture-queue", () => ({
  schedulePaymentCapture: jest.fn(),
}));

jest.mock("../../src/utils/posthog", () => ({
  getPostHog: jest.fn().mockReturnValue(null),
}));

describe("Order Placed Subscriber", () => {
  let mockContainer: any;
  let mockLogger: any;
  let mockQuery: any;
  let mockModificationTokenService: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.STOREFRONT_URL = "http://test-store.com";

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockModificationTokenService = {
      generateToken: jest.fn().mockReturnValue("mock_token_123"),
    };

    mockContainer = {
      resolve: jest.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "query") return mockQuery;
        if (key === "modificationTokenService") return mockModificationTokenService;
        return null;
      }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createQueryMock = (orderData: any) => {
    mockQuery = {
      graph: jest.fn().mockResolvedValue({
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

    expect(mockModificationTokenService.generateToken).toHaveBeenCalledWith(
      "order_guest_1",
      "pi_123",
      expect.any(Date)
    );

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          magicLink: expect.stringContaining("http://test-store.com/order/status/order_guest_1?token=mock_token_123"),
          isGuest: true
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

    expect(mockModificationTokenService.generateToken).not.toHaveBeenCalled();

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          magicLink: null,
          isGuest: false
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
    mockModificationTokenService.generateToken.mockImplementationOnce(() => {
      throw new Error("Failed for user user@example.com because reason");
    });

    const event = { data: { id: "order_fail_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    // Expect warned logs with SANITIZED message
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[EMAIL\]\[WARN\] Failed to generate magic link for order order_fail_1: Failed for user \*\*\* because reason/)
    );

    // Should still enqueue email, just without link
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          magicLink: null,
          isGuest: true
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
    expect(mockModificationTokenService.generateToken).not.toHaveBeenCalled();

    // Ensure warning logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not find payment intent ID for guest order")
    );

    // Email still sent
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          magicLink: null,
          isGuest: true
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
        data: expect.objectContaining({
          magicLink: expect.stringContaining("http://localhost:5173/order/status/order_local_1"),
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

    (enqueueEmail as jest.Mock).mockRejectedValueOnce(new Error("Queue full"));

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