import {
  createWorkflow,
  WorkflowResponse,
  when,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "@medusajs/core-flows"
import { sendNotificationStep } from "./steps/send-notification"
import { trackWorkflowEventStep } from "./steps/track-analytics-event"

type SendOrderConfirmationInput = {
  id: string
  modification_token?: string
}

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  function (input: SendOrderConfirmationInput) {
    trackWorkflowEventStep({
      event: "email.order_confirmation.started",
      failureEvent: "email.order_confirmation.failed",
      properties: {
        order_id: input.id,
      },
    }).config({ name: "track-email-order-confirmation-started" })

    // Retrieve the order details using Remote Query
    const orders = useRemoteQueryStep({
      entry_point: "order",
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
      variables: {
        filters: {
          id: input.id,
        },
      },
      list: true,
    })

    // Send email only if order has an email
    when({ orders }, ({ orders }) => {
      return orders && orders.length > 0 && !!orders[0]?.email
    }).then(() => {
      const orderData = transform({ orders }, ({ orders }) => orders[0])

      sendNotificationStep(transform({ orderData, input }, ({ orderData, input }) => [
        {
          to: orderData.email || "",
          channel: "email",
          template: "order-placed",
          data: { 
            order: orderData,
            modification_token: input.modification_token,
          },
        },
      ]))
    })

    trackWorkflowEventStep({
      event: "email.order_confirmation.succeeded",
      properties: {
        order_id: input.id,
      },
    }).config({ name: "track-email-order-confirmation-succeeded" })

    return new WorkflowResponse({ success: true })
  }
)
