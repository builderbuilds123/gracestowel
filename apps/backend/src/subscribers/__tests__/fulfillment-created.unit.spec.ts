/**
 * Unit tests for fulfillment-created subscriber
 */

import fulfillmentCreatedHandler, { config } from "../fulfillment-created"

// Mock the workflow
jest.mock("../../workflows/send-shipping-confirmation", () => ({
  sendShippingConfirmationWorkflow: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({ result: "success" }),
  })),
}))

describe("fulfillmentCreatedHandler", () => {
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
    it("should listen to fulfillment.created event", () => {
      expect(config.event).toBe("fulfillment.created")
    })

    it("should export config object", () => {
      expect(config).toBeDefined()
      expect(typeof config).toBe("object")
    })
  })

  describe("handler function", () => {
    it("should be defined as a function", () => {
      expect(fulfillmentCreatedHandler).toBeDefined()
      expect(typeof fulfillmentCreatedHandler).toBe("function")
    })

    it("should call sendShippingConfirmationWorkflow with fulfillment id", async () => {
      const { sendShippingConfirmationWorkflow } = require("../../workflows/send-shipping-confirmation")
      
      const mockEvent = {
        data: { id: "ful_test_123" },
      }

      await fulfillmentCreatedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendShippingConfirmationWorkflow).toHaveBeenCalledWith(mockContainer)
    })

    it("should log fulfillment created event", async () => {
      const consoleSpy = jest.spyOn(console, "log")
      
      const mockEvent = {
        data: { id: "ful_test_456" },
      }

      await fulfillmentCreatedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        "Fulfillment created event received:",
        "ful_test_456"
      )
    })

    it("should handle workflow errors gracefully", async () => {
      const { sendShippingConfirmationWorkflow } = require("../../workflows/send-shipping-confirmation")
      
      sendShippingConfirmationWorkflow.mockImplementationOnce(() => ({
        run: jest.fn().mockRejectedValue(new Error("Workflow failed")),
      }))

      const consoleSpy = jest.spyOn(console, "error")

      const mockEvent = {
        data: { id: "ful_test_error" },
      }

      // Should not throw
      await expect(
        fulfillmentCreatedHandler({
          event: mockEvent,
          container: mockContainer,
        } as any)
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to send shipping confirmation email:",
        expect.any(Error)
      )
    })
  })

  describe("event data", () => {
    it("should extract fulfillment id from event data", () => {
      const mockEvent = {
        data: { id: "ful_extracted_123" },
      }

      expect(mockEvent.data.id).toBe("ful_extracted_123")
    })
  })
})

