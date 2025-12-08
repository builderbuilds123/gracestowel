/**
 * Unit tests for order-placed email template
 * Story 2.1: Fix Modification Token Flow - Verify email renders modify order link
 */

import * as React from "react"
import { render } from "@react-email/components"
import { OrderPlacedEmailComponent } from "../../src/modules/resend/emails/order-placed"

describe("OrderPlacedEmailComponent", () => {
  const mockOrder = {
    id: "order_test_123",
    display_id: "123",
    email: "test@example.com",
    currency_code: "usd",
    total: 5000,
    subtotal: 4500,
    shipping_total: 500,
    tax_total: 0,
    items: [
      {
        title: "Premium Towel",
        variant_title: "White",
        quantity: 2,
        unit_price: 2250,
      },
    ],
    shipping_address: {
      first_name: "John",
      last_name: "Doe",
      address_1: "123 Main St",
      city: "New York",
      province: "NY",
      postal_code: "10001",
      country_code: "us",
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("basic rendering", () => {
    it("should render order confirmation heading", async () => {
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { order: mockOrder })
      )
      expect(html).toContain("Order Confirmation")
      expect(html).toContain("Grace Stowel")
    })

    it("should render order display id", async () => {
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { order: mockOrder })
      )
      // Check that the display_id is present (# may be HTML encoded as &#x23; or similar)
      expect(html).toContain("123")
      expect(html).toContain("Order")
    })

    it("should render order items", async () => {
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { order: mockOrder })
      )
      expect(html).toContain("Premium Towel")
      expect(html).toContain("White")
    })
  })

  describe("modification token rendering (Story 2.1)", () => {
    const originalEnv = process.env.STORE_URL

    beforeEach(() => {
      process.env.STORE_URL = "https://test.gracestowel.com"
    })

    afterEach(() => {
      if (originalEnv) {
        process.env.STORE_URL = originalEnv
      } else {
        delete process.env.STORE_URL
      }
    })

    it("should render modify order link when modification_token is provided", async () => {
      const token = "test-modification-token-for-unit-tests"
      
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { 
          order: mockOrder,
          modification_token: token,
        })
      )
      
      expect(html).toContain("Modify Order")
      expect(html).toContain("Changed your mind? You have 1 hour to modify your order.")
      expect(html).toContain(`https://test.gracestowel.com/order/edit/${mockOrder.id}?token=${token}`)
    })

    it("should NOT render modify order section when modification_token is undefined", async () => {
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { 
          order: mockOrder,
          modification_token: undefined,
        })
      )
      
      expect(html).not.toContain("Modify Order")
      expect(html).not.toContain("Changed your mind?")
    })

    it("should NOT render modify order section when modification_token is empty string", async () => {
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { 
          order: mockOrder,
          modification_token: "",
        })
      )
      
      expect(html).not.toContain("Modify Order")
      expect(html).not.toContain("Changed your mind?")
    })

    it("should log error and not render link when STORE_URL is missing", async () => {
      delete process.env.STORE_URL
      const consoleSpy = jest.spyOn(console, "error")
      const token = "test-modification-token-for-unit-tests"
      
      const html = await render(
        React.createElement(OrderPlacedEmailComponent, { 
          order: mockOrder,
          modification_token: token,
        })
      )
      
      expect(consoleSpy).toHaveBeenCalledWith(
        "[OrderPlacedEmail] STORE_URL environment variable is not set - modify order link will not be included"
      )
      expect(html).not.toContain("Modify Order")
    })
  })
})
