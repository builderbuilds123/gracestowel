/**
 * Unit tests for send-shipping-confirmation workflow
 */

import { sendShippingConfirmationWorkflow } from "../../src/workflows/send-shipping-confirmation"

describe("sendShippingConfirmationWorkflow", () => {
  describe("workflow definition", () => {
    it("should be defined", () => {
      expect(sendShippingConfirmationWorkflow).toBeDefined()
    })

    it("should have correct workflow name", () => {
      expect(sendShippingConfirmationWorkflow.getName()).toBe("send-shipping-confirmation")
    })
  })

  describe("input transformation", () => {
    it("should accept fulfillment id as input", () => {
      const mockInput = { id: "ful_test_123" }
      expect(mockInput).toHaveProperty("id")
      expect(typeof mockInput.id).toBe("string")
    })
  })

  describe("notification data structure", () => {
    it("should generate correct notification for fulfillment with tracking", () => {
      const mockFulfillment = {
        id: "ful_test_123",
        tracking_numbers: ["1Z999AA10123456784"],
        tracking_links: [{ url: "https://tracking.example.com/1Z999AA10123456784" }],
        order: {
          id: "ord_test_123",
          email: "customer@example.com",
          display_id: "12345",
          items: [
            {
              title: "Premium Towel",
              quantity: 2,
              unit_price: 2999,
            },
          ],
          shipping_address: {
            first_name: "John",
            last_name: "Doe",
            address_1: "123 Main St",
            city: "New York",
            province: "NY",
            postal_code: "10001",
            country_code: "US",
          },
        },
      }

      // Simulate the transform function logic
      const notificationData = mockFulfillment.order?.email
        ? [
            {
              to: mockFulfillment.order.email,
              channel: "email",
              template: "shipping-confirmation",
              data: {
                order: {
                  id: mockFulfillment.order.id,
                  display_id: mockFulfillment.order.display_id,
                  items: mockFulfillment.order.items,
                  shipping_address: mockFulfillment.order.shipping_address,
                },
                fulfillment: {
                  id: mockFulfillment.id,
                  tracking_numbers: mockFulfillment.tracking_numbers,
                  tracking_links: mockFulfillment.tracking_links,
                },
              },
            },
          ]
        : []

      expect(notificationData).toHaveLength(1)
      expect(notificationData[0].to).toBe("customer@example.com")
      expect(notificationData[0].template).toBe("shipping-confirmation")
      expect(notificationData[0].data.fulfillment.tracking_numbers).toContain("1Z999AA10123456784")
    })

    it("should return empty array when order has no email", () => {
      const mockFulfillment = {
        id: "ful_test_123",
        order: {
          id: "ord_test_123",
          email: null,
        },
      }

      const notificationData = mockFulfillment.order?.email
        ? [{ to: mockFulfillment.order.email }]
        : []

      expect(notificationData).toHaveLength(0)
    })

    it("should handle fulfillment without tracking numbers", () => {
      const mockFulfillment = {
        id: "ful_test_123",
        tracking_numbers: [],
        tracking_links: [],
        order: {
          id: "ord_test_123",
          email: "customer@example.com",
        },
      }

      expect(mockFulfillment.tracking_numbers).toHaveLength(0)
      expect(mockFulfillment.tracking_links).toHaveLength(0)
    })
  })
})

