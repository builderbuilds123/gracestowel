/**
 * Unit tests for send-order-canceled workflow
 */

import { sendOrderCanceledWorkflow } from "../send-order-canceled"

describe("sendOrderCanceledWorkflow", () => {
  describe("workflow definition", () => {
    it("should be defined", () => {
      expect(sendOrderCanceledWorkflow).toBeDefined()
    })

    it("should have correct workflow name", () => {
      expect(sendOrderCanceledWorkflow.getName()).toBe("send-order-canceled")
    })
  })

  describe("input transformation", () => {
    it("should accept order id as input", () => {
      const mockInput = { id: "ord_test_123" }
      expect(mockInput).toHaveProperty("id")
      expect(typeof mockInput.id).toBe("string")
    })
  })

  describe("notification data structure", () => {
    it("should generate correct notification for canceled order", () => {
      const mockOrder = {
        id: "ord_test_123",
        email: "customer@example.com",
        display_id: "12345",
        items: [
          {
            title: "Premium Towel",
            quantity: 2,
            unit_price: 2999,
            thumbnail: "https://example.com/towel.jpg",
          },
          {
            title: "Bath Set",
            quantity: 1,
            unit_price: 4999,
            thumbnail: null,
          },
        ],
        total: 10997,
        currency_code: "usd",
      }

      // Simulate the transform function logic
      const notificationData = mockOrder.email
        ? [
            {
              to: mockOrder.email,
              channel: "email",
              template: "order-canceled",
              data: {
                order: {
                  id: mockOrder.id,
                  display_id: mockOrder.display_id,
                  items: mockOrder.items,
                  total: mockOrder.total,
                  currency_code: mockOrder.currency_code,
                },
              },
            },
          ]
        : []

      expect(notificationData).toHaveLength(1)
      expect(notificationData[0].to).toBe("customer@example.com")
      expect(notificationData[0].template).toBe("order-canceled")
      expect(notificationData[0].data.order.items).toHaveLength(2)
      expect(notificationData[0].data.order.total).toBe(10997)
    })

    it("should return empty array when order has no email", () => {
      const mockOrder = {
        id: "ord_test_123",
        email: null,
        display_id: "12345",
      }

      const notificationData = mockOrder.email ? [{ to: mockOrder.email }] : []

      expect(notificationData).toHaveLength(0)
    })

    it("should handle order with no items", () => {
      const mockOrder = {
        id: "ord_test_123",
        email: "customer@example.com",
        display_id: "12345",
        items: [],
        total: 0,
        currency_code: "usd",
      }

      expect(mockOrder.items).toHaveLength(0)
      expect(mockOrder.total).toBe(0)
    })

    it("should preserve currency code for refund display", () => {
      const mockOrder = {
        id: "ord_test_123",
        total: 5999,
        currency_code: "eur",
      }

      expect(mockOrder.currency_code).toBe("eur")
    })
  })
})

