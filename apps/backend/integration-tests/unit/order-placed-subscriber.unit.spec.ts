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

  beforeEach(() => {
    jest.clearAllMocks();

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

  const createQueryMock = (orderData: any) => {
    mockQuery = {
      graph: jest.fn().mockResolvedValue({
        data: [orderData]
      })
    };
  };

  it("generates magic link for guest orders", async () => {
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
          magicLink: expect.stringContaining("/order/status/order_guest_1?token=mock_token_123"),
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

  it("handles magic link generation failure gracefully", async () => {
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

    mockModificationTokenService.generateToken.mockImplementationOnce(() => {
      throw new Error("Token error");
    });

    const event = { data: { id: "order_fail_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("[EMAIL][WARN] Failed to generate magic link")
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
});
