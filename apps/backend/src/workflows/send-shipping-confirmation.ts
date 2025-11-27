import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { sendNotificationStep } from "./steps/send-notification"

type SendShippingConfirmationInput = {
  fulfillment_id: string
}

export const sendShippingConfirmationWorkflow = createWorkflow(
  "send-shipping-confirmation",
  (input: SendShippingConfirmationInput) => {
    // Retrieve the fulfillment details with order info
    const { data: fulfillments } = useQueryGraphStep({
      entity: "fulfillment",
      fields: [
        "id",
        "tracking_numbers",
        "tracking_links.*",
        "order.id",
        "order.display_id",
        "order.email",
        "order.shipping_address.*",
      ],
      filters: {
        id: input.fulfillment_id,
      },
    })

    // Transform data for the notification
    const notificationData = transform({ fulfillments }, (data) => {
      const fulfillment = data.fulfillments[0]

      if (!fulfillment?.order?.email) {
        return []
      }

      return [
        {
          to: fulfillment.order.email,
          channel: "email",
          template: "shipping-confirmation",
          data: {
            order: {
              id: fulfillment.order.id,
              display_id: fulfillment.order.display_id,
              email: fulfillment.order.email,
              shipping_address: fulfillment.order.shipping_address,
            },
            fulfillment: {
              id: fulfillment.id,
              tracking_numbers: fulfillment.tracking_numbers,
              tracking_links: fulfillment.tracking_links,
            },
          },
        },
      ]
    })

    // Send the notification
    const notification = sendNotificationStep(notificationData)

    return new WorkflowResponse(notification)
  }
)

