/**
 * Unit tests for order-placed subscriber
 * Story 2.1: Fix Modification Token Flow
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
          modification_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token"
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
          modification_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token",
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
      const consoleSpy = jest.spyOn(console, "log")
      
      const mockEvent = {
        data: { id: "order_test_456" },
      }

      await orderPlacedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        "Order placed event received:",
        "order_test_456"
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
})
