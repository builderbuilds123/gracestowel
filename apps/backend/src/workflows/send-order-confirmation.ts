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
      
      // Transform order items for email template
      const emailData = {
        order: {
          id: order.id,
          display_id: order.display_id,
          email: order.email,
          currency_code: order.currency_code,
          total: order.total,
          subtotal: order.subtotal,
          shipping_total: order.shipping_total,
          tax_total: order.tax_total,
          items: order.items?.map((item: Record<string, unknown>) => ({
            title: (item.variant as Record<string, unknown>)?.product 
              ? ((item.variant as Record<string, unknown>).product as Record<string, unknown>).title 
              : item.title,
            variant_title: (item.variant as Record<string, unknown>)?.title,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          shipping_address: order.shipping_address,
        },
      }

      sendNotificationStep([
        {
          to: order.email,
          channel: "email",
          template: "order-placed",
          data: emailData,
        },
      ])
    })

    return new WorkflowResponse({ success: true })
  }
)

