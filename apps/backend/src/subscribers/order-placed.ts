import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation"
import { schedulePaymentCapture } from "../lib/payment-capture-queue"
import { getPostHog } from "../utils/posthog"

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
      fields: ["id", "metadata", "customer_id", "total", "currency_code", "items.product_id", "items.title", "items.quantity", "items.unit_price"],
      filters: { id: data.id },
    })

    if (orders.length > 0) {
      const order = orders[0]
      const paymentIntentId = order.metadata?.stripe_payment_intent_id as string | undefined

      if (paymentIntentId) {
        await schedulePaymentCapture(data.id, paymentIntentId)
        console.log(`Payment capture scheduled for order ${data.id} (1 hour delay)`)
      } else {
        // M1: Log as error/warn indicating data integrity issue
        console.error(`[CRITICAL] No payment intent ID found for order ${data.id} - Automatic capture will NOT happen.`)
      }

      // Track order_placed event in PostHog
      try {
        const posthog = getPostHog()
        if (posthog) {
          posthog.capture({
            distinctId: order.customer_id || `guest_${order.id}`,
            event: 'order_placed',
            properties: {
              order_id: order.id,
              total: order.total,
              currency: order.currency_code,
              item_count: order.items?.length || 0,
              items: order.items?.map((item: any) => ({
                product_id: item.product_id,
                title: item.title,
                quantity: item.quantity,
                unit_price: item.unit_price,
              })) || [],
            },
          })
          console.log(`[PostHog] order_placed event tracked for order ${data.id}`)
        }
      } catch (error) {
        console.error('[PostHog] Failed to track order_placed event:', error)
      }
    }
  } catch (error) {
    console.error("Failed to schedule payment capture:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

