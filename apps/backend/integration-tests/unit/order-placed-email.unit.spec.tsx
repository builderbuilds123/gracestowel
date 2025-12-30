
import React from "react"
import { OrderPlacedEmailComponent } from "../../src/modules/resend/emails/order-placed"
import { render } from "@react-email/render"

describe("OrderPlacedEmail", () => {
  const mockOrder = {
    id: "order_123",
    display_id: "1001",
    email: "test@example.com",
    currency_code: "usd",
    items: [
      {
        title: "Test Item",
        quantity: 1,
        unit_price: 1000,
        variant_title: "Blue",
      },
    ],
    total: 1000,
    subtotal: 1000,
    shipping_total: 0,
    tax_total: 0,
    shipping_address: {
      first_name: "John",
      last_name: "Doe",
      address_1: "123 Main St",
      city: "Test City",
      province: "TS",
      postal_code: "12345",
      country_code: "us",
    },
  }

  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.STOREFRONT_URL = "http://localhost:8000"
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it("renders with magic link for guests (modification token present)", async () => {
    const html = await render(
      <OrderPlacedEmailComponent
        order={mockOrder}
        modification_token="test_token_123"
      />
    )

    expect(html).toContain("Modify Your Order")
    expect(html).toContain("http://localhost:8000/order/edit/order_123?token=test_token_123")
    expect(html).toContain("You have 1 hour to modify your order")
    expect(html).not.toContain("Log in to your account")
  })

  it("renders with login message for registered users (no modification token)", async () => {
    const html = await render(
      <OrderPlacedEmailComponent
        order={mockOrder}
        modification_token={undefined}
      />
    )

    expect(html).not.toContain("Modify Your Order")
    expect(html).toContain("Log in to your account to view and manage your order")
  })

  it("displays order details correctly", async () => {
    const html = await render(
      <OrderPlacedEmailComponent
        order={mockOrder}
      />
    )

    expect(html).toMatch(/Order #(?:<!-- -->)?1001/)
    expect(html).toContain("Test Item")
    expect(html).toMatch(/Qty: (?:<!-- -->)?1/)
    expect(html).toContain("$10.00") // 1000 cents = $10.00
  })
})
