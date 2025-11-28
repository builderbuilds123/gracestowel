import {
  createWorkflow,
  WorkflowResponse,
  when,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { sendNotificationStep } from "./steps/send-notification"

type SendOrderConfirmationInput = {
  id: string
}

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  (input: SendOrderConfirmationInput) => {
    // Retrieve the order details using Query
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "subtotal",
        "shipping_total",
        "tax_total",
        "items.*",
        "items.variant.*",
        "items.variant.product.*",
        "shipping_address.*",
      ],
      filters: {
        id: input.id,
      },
    })

    // Send email only if order has an email
    when({ orders }, ({ orders }) => {
      return orders && orders.length > 0 && !!orders[0].email
    }).then(() => {
      const order = orders[0]
      
      sendNotificationStep([
        {
          to: order.email,
          channel: "email",
          template: "order-placed",
          data: { order },
        },
      ])
    })

    return new WorkflowResponse({ success: true })
  }
)

