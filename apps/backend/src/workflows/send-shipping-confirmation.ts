import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "@medusajs/core-flows"
import { sendNotificationStep } from "./steps/send-notification"

type SendShippingConfirmationInput = {
  fulfillment_id: string
}

export const sendShippingConfirmationWorkflow = createWorkflow(
  "send-shipping-confirmation",
  (input: SendShippingConfirmationInput) => {
    // Retrieve the fulfillment details with order info
    const fulfillments = useRemoteQueryStep({
      entry_point: "fulfillment",
      fields: [
        "id",
        "data",
        "metadata",
        "order.id",
        "order.email",
        "order.shipping_address.*",
      ],
      variables: {
        filters: {
          id: input.fulfillment_id,
        },
      },
      list: true,
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

