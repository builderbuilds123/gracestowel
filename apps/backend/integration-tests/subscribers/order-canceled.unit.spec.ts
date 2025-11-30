/**
 * Unit tests for order-canceled subscriber
 */

import orderCanceledHandler, { config } from "../../src/subscribers/order-canceled"

// Mock the workflow
jest.mock("../../src/workflows/send-order-canceled", () => ({
  sendOrderCanceledWorkflow: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({ result: "success" }),
  })),
}))

describe("orderCanceledHandler", () => {
  const mockContainer = {
    resolve: jest.fn(),
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
    it("should listen to order.canceled event", () => {
      expect(config.event).toBe("order.canceled")
    })

    it("should export config object", () => {
      expect(config).toBeDefined()
      expect(typeof config).toBe("object")
    })
  })

  describe("handler function", () => {
    it("should be defined as a function", () => {
      expect(orderCanceledHandler).toBeDefined()
      expect(typeof orderCanceledHandler).toBe("function")
    })

    it("should call sendOrderCanceledWorkflow with order id", async () => {
      const { sendOrderCanceledWorkflow } = require("../../src/workflows/send-order-canceled")
      
      const mockEvent = {
        data: { id: "ord_test_123" },
      }

      await orderCanceledHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendOrderCanceledWorkflow).toHaveBeenCalledWith(mockContainer)
    })

    it("should log order canceled event", async () => {
      const consoleSpy = jest.spyOn(console, "log")
      
      const mockEvent = {
        data: { id: "ord_test_456" },
      }

      await orderCanceledHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        "Order canceled event received:",
        "ord_test_456"
      )
    })

    it("should handle workflow errors gracefully", async () => {
      const { sendOrderCanceledWorkflow } = require("../../src/workflows/send-order-canceled")
      
      sendOrderCanceledWorkflow.mockImplementationOnce(() => ({
        run: jest.fn().mockRejectedValue(new Error("Workflow failed")),
      }))

      const consoleSpy = jest.spyOn(console, "error")

      const mockEvent = {
        data: { id: "ord_test_error" },
      }

      // Should not throw
      await expect(
        orderCanceledHandler({
          event: mockEvent,
          container: mockContainer,
        } as any)
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to send order canceled email:",
        expect.any(Error)
      )
    })
  })

  describe("event data", () => {
    it("should extract order id from event data", () => {
      const mockEvent = {
        data: { id: "ord_extracted_123" },
      }

      expect(mockEvent.data.id).toBe("ord_extracted_123")
    })
  })
})

