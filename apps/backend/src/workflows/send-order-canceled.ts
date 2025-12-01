import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "@medusajs/core-flows"
import { sendNotificationStep } from "./steps/send-notification"

type SendOrderCanceledInput = {
  id: string
  reason?: string
}

export const sendOrderCanceledWorkflow = createWorkflow(
  "send-order-canceled",
  (input: SendOrderCanceledInput) => {
    // Retrieve the order details
    const orders = useRemoteQueryStep({
      entry_point: "order",
      fields: [
        "id",
        "email",
        "currency_code",
        "total",
        "items.*",
        "items.variant.*",
        "items.variant.product.*",
        "canceled_at",
      ],
      variables: {
        filters: {
          id: input.id,
        },
      },
      list: true,
    })

    // Transform data for the notification
    const notificationData = transform({ orders, input }, (data) => {
      const order = data.orders[0]

      if (!order?.email) {
        return []
      }

      return [
        {
          to: order.email,
          channel: "email",
          template: "order-canceled",
          data: {
            order: {
              id: order.id,
              email: order.email,
              total: order.total,
              currency_code: order.currency_code,
              canceled_at: order.canceled_at,
              items: order.items
                ?.filter((item: any) => item != null)
                .map((item: any) => ({
                  title: item.variant?.product?.title || "Unknown Product",
                  variant_title: item.variant?.title,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                })),
            },
            reason: data.input.reason,
          },
        },
      ]
    })

    // Send the notification
    const notification = sendNotificationStep(notificationData)

    return new WorkflowResponse(notification)
  }
)

