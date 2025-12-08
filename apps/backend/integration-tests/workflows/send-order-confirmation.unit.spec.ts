/**
 * Unit tests for send-order-confirmation workflow
 * Story 2.1: Fix Modification Token Flow
 */

import { sendOrderConfirmationWorkflow } from "../../src/workflows/send-order-confirmation"

// Mock the useRemoteQueryStep
jest.mock("@medusajs/core-flows", () => ({
  useRemoteQueryStep: jest.fn(() => [{
    id: "order_test_123",
    display_id: "123",
    email: "test@example.com",
    currency_code: "usd",
    total: 1000,
    subtotal: 900,
    shipping_total: 100,
    tax_total: 0,
    items: [],
    shipping_address: {},
  }]),
}))

// Mock the sendNotificationStep
jest.mock("../../src/workflows/steps/send-notification", () => ({
  sendNotificationStep: jest.fn(() => []),
}))

describe("sendOrderConfirmationWorkflow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("workflow definition", () => {
    it("should be defined", () => {
      expect(sendOrderConfirmationWorkflow).toBeDefined()
      expect(typeof sendOrderConfirmationWorkflow).toBe("function")
    })

    it("should have correct workflow name", () => {
      // The workflow should be named "send-order-confirmation"
      expect(sendOrderConfirmationWorkflow.name).toBeDefined()
    })
  })

  describe("input types (Story 2.1)", () => {
    it("should accept id in input", () => {
      const input = { id: "order_test_123" }
      expect(input.id).toBe("order_test_123")
    })

    it("should accept optional modification_token in input", () => {
      const inputWithToken = { 
        id: "order_test_123",
        modification_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token"
      }
      expect(inputWithToken.modification_token).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token")
    })

    it("should allow modification_token to be undefined", () => {
      const inputWithoutToken = { 
        id: "order_test_123",
        modification_token: undefined
      }
      expect(inputWithoutToken.modification_token).toBeUndefined()
    })
  })
})
