import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderCanceledWorkflow } from "../workflows/send-order-canceled"
import { cancelPaymentCaptureJob } from "../lib/payment-capture-queue"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"

interface OrderCanceledEventData {
  id: string;
  reason?: string;
}

export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderCanceledEventData>) {
  console.log("Order canceled event received:", data.id)

  // Cancel any scheduled payment capture job
  try {
    const canceled = await cancelPaymentCaptureJob(data.id)
    if (canceled) {
      console.log(`Payment capture job canceled for order ${data.id}`)
    }
  } catch (error) {
    console.error("Failed to cancel payment capture job:", error)
  }

  // Send order canceled email
  try {
    await sendOrderCanceledWorkflow(container).run({
      input: {
        id: data.id,
        reason: data.reason,
      },
    })
    console.log("Order canceled email workflow completed for order:", data.id)
  } catch (error) {
    console.error("Failed to send order canceled email:", error)
  }

  // Send admin notification for canceled order
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.ORDER_CANCELED,
      title: "Order Canceled",
      description: `Order ${data.id} has been canceled${data.reason ? `: ${data.reason}` : ""}`,
      metadata: { order_id: data.id, reason: data.reason },
    })
  } catch (error) {
    console.error("Failed to send admin notification for order cancellation:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}

