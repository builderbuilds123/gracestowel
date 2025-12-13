/**
 * Unit tests for order-placed subscriber
 * Story 2.1: Fix Modification Token Flow
 * Story 2.1: Implement Server-Side Event Tracking for Key Order Events
 */

import orderPlacedHandler, { config } from "../../src/subscribers/order-placed"

// Mock the workflow
jest.mock("../../src/workflows/send-order-confirmation", () => ({
  sendOrderConfirmationWorkflow: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({ result: "success" }),
  })),
}))

// Mock the payment capture queue
jest.mock("../../src/lib/payment-capture-queue", () => ({
  schedulePaymentCapture: jest.fn().mockResolvedValue(undefined),
}))

// Mock PostHog
jest.mock("../../src/utils/posthog", () => ({
  getPostHog: jest.fn(() => ({
    capture: jest.fn(),
  })),
}))

describe("orderPlacedHandler", () => {
  // Mock logger for structured logging tests
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const mockQuery = {
    graph: jest.fn().mockResolvedValue({
      data: [{
        id: "order_test_123",
        metadata: { stripe_payment_intent_id: "pi_test_123" },
        customer_id: "cust_123",
        total: 1000,
        currency_code: "usd",
        items: [],
      }],
    }),
  }

  const mockContainer = {
    resolve: jest.fn((key: string) => {
      if (key === "query") return mockQuery
      if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
      return undefined
    }),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("subscriber configuration", () => {
    it("should listen to order.placed event", () => {
      expect(config.event).toBe("order.placed")
    })

    it("should export config object", () => {
      expect(config).toBeDefined()
      expect(typeof config).toBe("object")
    })
  })

  describe("modification token propagation (Story 2.1)", () => {
    it("should pass modification_token to sendOrderConfirmationWorkflow when present", async () => {
      const { sendOrderConfirmationWorkflow } = require("../../src/workflows/send-order-confirmation")
      
      const mockWorkflowRun = jest.fn().mockResolvedValue({ result: "success" })
      sendOrderConfirmationWorkflow.mockReturnValue({ run: mockWorkflowRun })
      
      const mockEvent = {
        data: { 
          id: "order_test_123",
          modification_token: "test-modification-token-for-unit-tests"
        },
      }

      await orderPlacedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendOrderConfirmationWorkflow).toHaveBeenCalledWith(mockContainer)
      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: {
          id: "order_test_123",
          modification_token: "test-modification-token-for-unit-tests",
        },
      })
    })

    it("should work without modification_token (backward compatibility)", async () => {
      const { sendOrderConfirmationWorkflow } = require("../../src/workflows/send-order-confirmation")
      
      const mockWorkflowRun = jest.fn().mockResolvedValue({ result: "success" })
      sendOrderConfirmationWorkflow.mockReturnValue({ run: mockWorkflowRun })
      
      const mockEvent = {
        data: { id: "order_test_456" },
      }

      await orderPlacedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendOrderConfirmationWorkflow).toHaveBeenCalledWith(mockContainer)
      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: {
          id: "order_test_456",
          modification_token: undefined,
        },
      })
    })
  })

  describe("handler function", () => {
    it("should be defined as a function", () => {
      expect(orderPlacedHandler).toBeDefined()
      expect(typeof orderPlacedHandler).toBe("function")
    })

    it("should call sendOrderConfirmationWorkflow with order id", async () => {
      const { sendOrderConfirmationWorkflow } = require("../../src/workflows/send-order-confirmation")
      
      const mockEvent = {
        data: { id: "order_test_123" },
      }

      await orderPlacedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendOrderConfirmationWorkflow).toHaveBeenCalledWith(mockContainer)
    })

    it("should log order placed event", async () => {
      const mockEvent = {
        data: { id: "order_test_456" },
      }

      await orderPlacedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      // Verify logger.info was called with order placed message
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Order placed event received: order_test_456")
      )
    })

    it("should handle workflow errors gracefully", async () => {
      const { sendOrderConfirmationWorkflow } = require("../../src/workflows/send-order-confirmation")
      
      sendOrderConfirmationWorkflow.mockImplementationOnce(() => ({
        run: jest.fn().mockRejectedValue(new Error("Workflow failed")),
      }))

      const consoleSpy = jest.spyOn(console, "error")

      const mockEvent = {
        data: { id: "order_test_error" },
      }

      // Should not throw
      await expect(
        orderPlacedHandler({
          event: mockEvent,
          container: mockContainer,
        } as any)
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to send order confirmation email:",
        expect.any(Error)
      )
    })
  })

  describe("Redis connection failure handling (Story 6.2)", () => {
    it("should flag order for recovery when Redis connection fails", async () => {
      const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
      
      // Simulate Redis connection error
      const redisError = new Error("Redis connection refused")
      ;(redisError as any).code = "ECONNREFUSED"
      schedulePaymentCapture.mockRejectedValueOnce(redisError)
      
      const mockOrderService = {
        updateOrders: jest.fn().mockResolvedValue([{}]),
      }
      
      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return mockQuery
          if (key === "order") return mockOrderService
          return undefined
        }),
      }

      const mockEvent = {
        data: { id: "order_redis_fail" },
      }

      // Should not throw
      await expect(
        orderPlacedHandler({
          event: mockEvent,
          container: testContainer,
        } as any)
      ).resolves.not.toThrow()

      // Verify CRITICAL log using structured logger
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("[CRITICAL][DLQ]"),
        expect.any(Error)
      )

      // Verify order service was called to update metadata
      expect(testContainer.resolve).toHaveBeenCalledWith("order")
      expect(mockOrderService.updateOrders).toHaveBeenCalledWith([{
        id: "order_redis_fail",
        metadata: expect.objectContaining({
          needs_recovery: true,
          recovery_reason: "redis_failure"
        })
      }])
    })

    it("should re-throw non-Redis errors", async () => {
      const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
      
      // Simulate non-Redis error (no ECONNREFUSED code)
      const otherError = new Error("Some other error")
      schedulePaymentCapture.mockRejectedValueOnce(otherError)
      
      const consoleSpy = jest.spyOn(console, "error")

      const mockEvent = {
        data: { id: "order_other_error" },
      }

      // Should not throw (outer catch handles it)
      await expect(
        orderPlacedHandler({
          event: mockEvent,
          container: mockContainer,
        } as any)
      ).resolves.not.toThrow()

      // Verify generic error log (not CRITICAL)
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to schedule payment capture:",
        expect.any(Error)
      )
    })
  })

  describe("PostHog order_placed event tracking (Story 2.1 - AC2, AC3, AC4, AC5, AC6)", () => {
    let mockCapture: jest.Mock

    beforeEach(() => {
      mockCapture = jest.fn()
      const { getPostHog } = require("../../src/utils/posthog")
      getPostHog.mockReturnValue({ capture: mockCapture })
    })

    it("should capture order_placed event with correct properties (AC2, AC3)", async () => {
      const orderWithItems = {
        id: "order_posthog_test",
        metadata: { stripe_payment_intent_id: "pi_test_123" },
        customer_id: "cust_analytics_123",
        total: 5999,
        currency_code: "usd",
        items: [
          { product_id: "prod_1", title: "Test Product", quantity: 2, unit_price: 2999 },
        ],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [orderWithItems] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      await orderPlacedHandler({
        event: { data: { id: "order_posthog_test" } },
        container: testContainer,
      } as any)

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: "cust_analytics_123",
        event: "order_placed",
        properties: {
          order_id: "order_posthog_test",
          total: 5999,
          currency: "usd",
          item_count: 1,
          items: [
            { product_id: "prod_1", title: "Test Product", quantity: 2, unit_price: 2999 },
          ],
        },
      })
    })

    it("should use customer_id as distinctId when available (AC4, AC5, AC6)", async () => {
      const authenticatedOrder = {
        id: "order_auth_user",
        metadata: { stripe_payment_intent_id: "pi_auth_123" },
        customer_id: "cust_medusa_customer_id",
        total: 1000,
        currency_code: "eur",
        items: [],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [authenticatedOrder] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      await orderPlacedHandler({
        event: { data: { id: "order_auth_user" } },
        container: testContainer,
      } as any)

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "cust_medusa_customer_id",
          event: "order_placed",
        })
      )
    })

    it("should fallback to guest_${order.id} for guest checkout (AC4, AC6)", async () => {
      const guestOrder = {
        id: "order_guest_checkout",
        metadata: { stripe_payment_intent_id: "pi_guest_123" },
        customer_id: null, // Guest checkout - no customer
        total: 2500,
        currency_code: "gbp",
        items: [],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [guestOrder] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      await orderPlacedHandler({
        event: { data: { id: "order_guest_checkout" } },
        container: testContainer,
      } as any)

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "guest_order_guest_checkout",
          event: "order_placed",
        })
      )
    })

    it("should include all order items in event properties (AC3)", async () => {
      const multiItemOrder = {
        id: "order_multi_items",
        metadata: { stripe_payment_intent_id: "pi_multi_123" },
        customer_id: "cust_multi",
        total: 15000,
        currency_code: "usd",
        items: [
          { product_id: "prod_a", title: "Product A", quantity: 1, unit_price: 5000 },
          { product_id: "prod_b", title: "Product B", quantity: 2, unit_price: 3000 },
          { product_id: "prod_c", title: "Product C", quantity: 3, unit_price: 1000 },
        ],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [multiItemOrder] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      await orderPlacedHandler({
        event: { data: { id: "order_multi_items" } },
        container: testContainer,
      } as any)

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            item_count: 3,
            items: [
              { product_id: "prod_a", title: "Product A", quantity: 1, unit_price: 5000 },
              { product_id: "prod_b", title: "Product B", quantity: 2, unit_price: 3000 },
              { product_id: "prod_c", title: "Product C", quantity: 3, unit_price: 1000 },
            ],
          }),
        })
      )
    })

    it("should handle orders with no items gracefully", async () => {
      const emptyOrder = {
        id: "order_empty",
        metadata: { stripe_payment_intent_id: "pi_empty_123" },
        customer_id: "cust_empty",
        total: 0,
        currency_code: "usd",
        items: undefined,
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [emptyOrder] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      await orderPlacedHandler({
        event: { data: { id: "order_empty" } },
        container: testContainer,
      } as any)

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            item_count: 0,
            items: [],
          }),
        })
      )
    })

    it("should not throw when PostHog is not configured (AC1 graceful degradation)", async () => {
      const { getPostHog } = require("../../src/utils/posthog")
      getPostHog.mockReturnValue(null) // PostHog not configured

      const orderData = {
        id: "order_no_posthog",
        metadata: { stripe_payment_intent_id: "pi_no_ph_123" },
        customer_id: "cust_no_ph",
        total: 1000,
        currency_code: "usd",
        items: [],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [orderData] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      // Should not throw
      await expect(
        orderPlacedHandler({
          event: { data: { id: "order_no_posthog" } },
          container: testContainer,
        } as any)
      ).resolves.not.toThrow()

      // capture should not be called since PostHog is null
      expect(mockCapture).not.toHaveBeenCalled()
    })

    it("should handle PostHog capture errors gracefully", async () => {
      mockCapture.mockImplementation(() => {
        throw new Error("PostHog API error")
      })

      const orderData = {
        id: "order_ph_error",
        metadata: { stripe_payment_intent_id: "pi_error_123" },
        customer_id: "cust_error",
        total: 1000,
        currency_code: "usd",
        items: [],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [orderData] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      const consoleSpy = jest.spyOn(console, "error")

      // Should not throw - errors are caught
      await expect(
        orderPlacedHandler({
          event: { data: { id: "order_ph_error" } },
          container: testContainer,
        } as any)
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "[PostHog] Failed to track order_placed event:",
        expect.any(Error)
      )
    })

    it("should log successful PostHog tracking", async () => {
      const orderData = {
        id: "order_log_success",
        metadata: { stripe_payment_intent_id: "pi_log_123" },
        customer_id: "cust_log",
        total: 1000,
        currency_code: "usd",
        items: [],
      }

      const testQuery = {
        graph: jest.fn().mockResolvedValue({ data: [orderData] }),
      }

      const testContainer = {
        resolve: jest.fn((key: string) => {
          if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) return mockLogger
          if (key === "query") return testQuery
          return undefined
        }),
      }

      const consoleSpy = jest.spyOn(console, "log")

      await orderPlacedHandler({
        event: { data: { id: "order_log_success" } },
        container: testContainer,
      } as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        "[PostHog] order_placed event tracked for order order_log_success"
      )
    })
  })
})
