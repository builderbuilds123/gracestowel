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
        "data",
        "metadata",
        "order.id",
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
              email: fulfillment.order.email,
              shipping_address: fulfillment.order.shipping_address,
            },
            fulfillment: {
              id: fulfillment.id,
              tracking_info: fulfillment.data || fulfillment.metadata,
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

