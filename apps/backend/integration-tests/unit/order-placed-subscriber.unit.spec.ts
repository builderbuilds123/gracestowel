import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import orderPlacedHandler from "../../src/subscribers/order-placed";
import { enqueueEmail } from "../../src/lib/email-queue";

vi.mock("../../src/lib/email-queue", () => ({
  enqueueEmail: vi.fn(),
}));

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger as mockLogger } from "../../src/utils/logger";

vi.mock("../../src/lib/payment-capture-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/payment-capture-queue")>();
  return {
    ...actual,
    schedulePaymentCapture: vi.fn(),
  };
});

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Order Placed Subscriber", () => {
  let mockContainer: any;
  // let mockLogger: any; // Now using imported mock
  let mockQuery: any;
  const originalEnv = process.env;
  let generateTokenSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.STOREFRONT_URL = "http://test-store.com";

    // Mock logger is already setup by vi.mock, just clear it
    // mockLogger = { ... }

    // Create a mock service instance with generateToken spy
    const mockModificationTokenService = {
      generateToken: vi.fn().mockReturnValue("mock_token_123"),
    };

    generateTokenSpy = vi.spyOn(mockModificationTokenService, "generateToken");

    mockContainer = {
      resolve: vi.fn((key) => {
        // if (key === "logger") return mockLogger;
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
    // Expect warned logs with SANITIZED message
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "email-magic-link",
      "Failed to generate magic link",
      expect.objectContaining({
        order_id: "order_fail_1",
        error: expect.stringMatching(/Failed for user \*\*\* because reason/)
      })
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
    // Ensure warning logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "email-magic-link",
      "Could not find payment intent ID - magic link skipped",
      expect.objectContaining({ order_id: "order_nopay_1" })
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
      "email-magic-link",
      "STOREFRONT_URL not set - using localhost default for magic link"
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
      "email-queue",
      "Failed to queue confirmation",
      expect.objectContaining({ order_id: "order_queue_fail" }),
      expect.any(Error)
    );
  });

  it("extracts color from metadata if present", async () => {
    const orderWithMetadata = {
      id: "order_color_1",
      display_id: "1007",
      email: "test@example.com",
      currency_code: "cad",
      total: 50.00,
      customer_id: "cust_123",
      items: [
        {
          item: {
            title: "Towel",
            product_title: "Grace Towel",
            variant_title: "Large",
            unit_price: 50.00,
            metadata: { color: "Sand" }
          },
          quantity: 1,
          unit_price: 50.00
        }
      ]
    };
    createQueryMock(orderWithMetadata);

    const event = { data: { id: "order_color_1" } };
    await orderPlacedHandler({ event, container: mockContainer } as any);

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          order: expect.objectContaining({
            items: [
              expect.objectContaining({
                title: "Grace Towel",
                variant_title: "Large",
                color: "Sand"
              })
            ]
          })
        })
      })
    );
  });
});
