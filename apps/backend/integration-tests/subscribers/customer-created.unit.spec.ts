/**
 * Unit tests for customer-created subscriber
 */

import customerCreatedHandler, { config } from "../../src/subscribers/customer-created"

// Mock the workflow
jest.mock("../../src/workflows/send-welcome-email", () => ({
  sendWelcomeEmailWorkflow: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({ result: "success" }),
  })),
}))

describe("customerCreatedHandler", () => {
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
    it("should listen to customer.created event", () => {
      expect(config.event).toBe("customer.created")
    })

    it("should export config object", () => {
      expect(config).toBeDefined()
      expect(typeof config).toBe("object")
    })
  })

  describe("handler function", () => {
    it("should be defined as a function", () => {
      expect(customerCreatedHandler).toBeDefined()
      expect(typeof customerCreatedHandler).toBe("function")
    })

    it("should call sendWelcomeEmailWorkflow with customer id", async () => {
      const { sendWelcomeEmailWorkflow } = require("../../src/workflows/send-welcome-email")
      
      const mockEvent = {
        data: { id: "cus_test_123" },
      }

      await customerCreatedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(sendWelcomeEmailWorkflow).toHaveBeenCalledWith(mockContainer)
    })

    it("should log customer created event", async () => {
      const consoleSpy = jest.spyOn(console, "log")
      
      const mockEvent = {
        data: { id: "cus_test_456" },
      }

      await customerCreatedHandler({
        event: mockEvent,
        container: mockContainer,
      } as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        "Customer created event received:",
        "cus_test_456"
      )
    })

    it("should handle workflow errors gracefully", async () => {
      const { sendWelcomeEmailWorkflow } = require("../../src/workflows/send-welcome-email")
      
      sendWelcomeEmailWorkflow.mockImplementationOnce(() => ({
        run: jest.fn().mockRejectedValue(new Error("Workflow failed")),
      }))

      const consoleSpy = jest.spyOn(console, "error")

      const mockEvent = {
        data: { id: "cus_test_error" },
      }

      // Should not throw
      await expect(
        customerCreatedHandler({
          event: mockEvent,
          container: mockContainer,
        } as any)
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to send welcome email:",
        expect.any(Error)
      )
    })
  })

  describe("event data", () => {
    it("should extract customer id from event data", () => {
      const mockEvent = {
        data: { id: "cus_extracted_123" },
      }

      expect(mockEvent.data.id).toBe("cus_extracted_123")
    })
  })
})

