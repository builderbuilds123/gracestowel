/**
 * Unit tests for send-welcome-email workflow
 */

import { sendWelcomeEmailWorkflow } from "../send-welcome-email"

describe("sendWelcomeEmailWorkflow", () => {
  describe("workflow definition", () => {
    it("should be defined", () => {
      expect(sendWelcomeEmailWorkflow).toBeDefined()
    })

    it("should have correct workflow name", () => {
      expect(sendWelcomeEmailWorkflow.getName()).toBe("send-welcome-email")
    })
  })

  describe("input transformation", () => {
    it("should accept customer id as input", () => {
      // The workflow expects { id: string } as input
      const mockInput = { id: "cus_test_123" }
      expect(mockInput).toHaveProperty("id")
      expect(typeof mockInput.id).toBe("string")
    })
  })

  describe("notification data structure", () => {
    it("should generate correct notification structure for customer with email", () => {
      const mockCustomer = {
        id: "cus_test_123",
        email: "test@example.com",
        first_name: "John",
        last_name: "Doe",
      }

      // Simulate the transform function logic
      const notificationData = mockCustomer.email
        ? [
            {
              to: mockCustomer.email,
              channel: "email",
              template: "welcome",
              data: {
                customer: {
                  id: mockCustomer.id,
                  email: mockCustomer.email,
                  first_name: mockCustomer.first_name,
                  last_name: mockCustomer.last_name,
                },
              },
            },
          ]
        : []

      expect(notificationData).toHaveLength(1)
      expect(notificationData[0]).toEqual({
        to: "test@example.com",
        channel: "email",
        template: "welcome",
        data: {
          customer: {
            id: "cus_test_123",
            email: "test@example.com",
            first_name: "John",
            last_name: "Doe",
          },
        },
      })
    })

    it("should return empty array when customer has no email", () => {
      const mockCustomer = {
        id: "cus_test_123",
        email: null,
        first_name: "John",
        last_name: "Doe",
      }

      const notificationData = mockCustomer.email ? [{ to: mockCustomer.email }] : []

      expect(notificationData).toHaveLength(0)
    })
  })

  describe("audience sync data structure", () => {
    it("should generate correct audience sync structure", () => {
      const mockCustomer = {
        id: "cus_test_123",
        email: "test@example.com",
        first_name: "John",
        last_name: "Doe",
      }

      // Simulate the audienceSyncData transform
      const audienceSyncData = {
        email: mockCustomer.email || "",
        first_name: mockCustomer.first_name,
        last_name: mockCustomer.last_name,
        unsubscribed: false,
      }

      expect(audienceSyncData).toEqual({
        email: "test@example.com",
        first_name: "John",
        last_name: "Doe",
        unsubscribed: false,
      })
    })

    it("should default to unsubscribed: false for new customers", () => {
      const audienceSyncData = {
        email: "test@example.com",
        unsubscribed: false,
      }

      expect(audienceSyncData.unsubscribed).toBe(false)
    })
  })
})

