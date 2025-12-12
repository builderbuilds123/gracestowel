import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
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
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(`Order placed event received: ${data.id}`)

  // Log masked token for audit trail (Story 4.1 requirement) - logged BEFORE email attempt
  if (data.modification_token) {
    logger.info(`[ORDER_PLACED] Token received (masked): ****...${data.modification_token.slice(-8)}`)
  }

  // Send order confirmation email
  try {
    await sendOrderConfirmationWorkflow(container).run({
      input: {
        id: data.id,
        modification_token: data.modification_token,
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
      const rawPaymentIntentId = order.metadata?.stripe_payment_intent_id
      
      // L1: Validate payment intent ID is a non-empty string
      const paymentIntentId = typeof rawPaymentIntentId === "string" && rawPaymentIntentId.startsWith("pi_")
        ? rawPaymentIntentId
        : undefined

      if (paymentIntentId) {
        try {
          await schedulePaymentCapture(data.id, paymentIntentId)
          logger.info(`Payment capture scheduled for order ${data.id} (1 hour delay)`)
        } catch (scheduleError: any) {
          // Story 6.2: Handle Redis connection failures gracefully
          const isRedisError = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(scheduleError?.code)
          
          if (isRedisError) {
            logger.error(`[CRITICAL][DLQ] Redis connection failed for order ${data.id} - flagging for recovery`, scheduleError)
            
            // Update order metadata with recovery flag
            const orderService = container.resolve("order")
            await orderService.updateOrders([{
              id: data.id,
              metadata: {
                ...order.metadata,
                needs_recovery: true,
                recovery_reason: 'redis_failure'
              }
            }])
            logger.info(`[RECOVERY] Order ${data.id} flagged for recovery due to Redis failure`)
          } else {
            // Re-throw non-Redis errors
            throw scheduleError
          }
        }
      } else {
        // M1: Log as error/warn indicating data integrity issue
        logger.error(`[CRITICAL] No payment intent ID found for order ${data.id} - Automatic capture will NOT happen.`)
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

