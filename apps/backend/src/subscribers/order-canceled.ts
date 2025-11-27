import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderCanceledWorkflow } from "../workflows/send-order-canceled"
import { cancelPaymentCaptureJob } from "../jobs/payment-capture-queue"

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
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}

