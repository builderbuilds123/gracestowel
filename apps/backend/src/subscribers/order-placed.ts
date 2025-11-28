import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation"
import { schedulePaymentCapture } from "../lib/payment-capture-queue"

interface OrderPlacedEventData {
  id: string;
  modification_token?: string;
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEventData>) {
  console.log("Order placed event received:", data.id)

  // Send order confirmation email
  try {
    await sendOrderConfirmationWorkflow(container).run({
      input: {
        id: data.id,
      },
    })
    console.log("Order confirmation email workflow completed for order:", data.id)
  } catch (error) {
    console.error("Failed to send order confirmation email:", error)
  }

  // Schedule payment capture after 1-hour modification window
  try {
    // Get the payment intent ID from the order metadata
    const query = container.resolve("query")
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: data.id },
    })

    if (orders.length > 0) {
      const order = orders[0]
      const paymentIntentId = order.metadata?.stripe_payment_intent_id as string | undefined

      if (paymentIntentId) {
        await schedulePaymentCapture(data.id, paymentIntentId)
        console.log(`Payment capture scheduled for order ${data.id} (1 hour delay)`)
      } else {
        console.warn(`No payment intent ID found for order ${data.id}`)
      }
    }
  } catch (error) {
    console.error("Failed to schedule payment capture:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

