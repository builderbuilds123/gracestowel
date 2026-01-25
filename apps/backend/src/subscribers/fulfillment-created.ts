// DEPRECATED: Replaced by native workflow (create-fulfillment-with-capture)
// This subscriber is disabled to prevent double-capture.
/*
import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { startEmailWorker } from "../workers/email-worker"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"
import { trackEvent } from "../utils/analytics"
import { capturePayment } from "../services/stripe-capture"

export default async function fulfillmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  // Ensure Email worker is running (lazy init)
  if (process.env.REDIS_URL) {
    startEmailWorker(container)
  }

  const logger = container.resolve("logger")
  logger.info(`[FULFILLMENT_CREATED] Fulfillment created event received: ${data.id}`)
  await trackEvent(container, "fulfillment.created", {
    properties: {
      fulfillment_id: data.id,
    },
  })
  
  try {
    const query = container.resolve("query")
    const { data: fulfillments } = await query.graph({
      entity: "fulfillment",
      fields: [
        "id",
        "data",
        "metadata",
        "order.id",
        "order.email",
        "order.shipping_address.*",
        "order.payment_collections.id",
        "order.payment_collections.payments.id",
        "order.payment_collections.payments.data",
      ],
      filters: { id: data.id },
    })

    const fulfillment = fulfillments[0]
    if (!fulfillment) {
      logger.error(`[EMAIL][ERROR] Fulfillment ${data.id} not found for shipping confirmation`)
      return
    }

    // Story 1.3: Fulfillment-triggered capture
    try {
      const order = fulfillment.order
      if (order?.id) {
        const paymentIntentId = order.payment_collections?.[0]?.payments?.[0]?.data?.id as string | undefined

        if (paymentIntentId) {
          // Check if payment is still authorized (not already captured)
          const payment = order.payment_collections?.[0]?.payments?.[0]
          // Note: We check via Stripe API in the capture service, but we can skip if we know it's already captured
          // For now, let the capture service handle all checks

          logger.info(`[FULFILLMENT_CREATED] Triggering capture on fulfillment`, {
            orderId: order.id,
            paymentIntentId,
            fulfillmentId: data.id,
          })

          await capturePayment(order.id, paymentIntentId, container)
          logger.info(`[FULFILLMENT_CREATED] Payment capture triggered successfully`, {
            orderId: order.id,
            paymentIntentId,
          })
        } else {
          logger.warn(`[FULFILLMENT_CREATED] No payment intent found for order ${order.id}`)
        }
      }
    } catch (captureError: any) {
      // Story 1.3 AC: Do NOT silently fail - log error and alert
      logger.error(`[FULFILLMENT_CREATED] Capture failed`, {
        fulfillmentId: data.id,
        orderId: fulfillment.order?.id,
        error: captureError?.message || String(captureError),
      })
      // Re-throw to ensure it's tracked/altered
      throw captureError
    }

    if (fulfillment.order?.email) {
      const result = await enqueueEmail({
        entityId: fulfillment.id,
        template: Templates.SHIPPING_CONFIRMATION,
        recipient: fulfillment.order.email,
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
      })
      if (result) {
        logger.info(`[EMAIL][QUEUE] Shipping confirmation email queued for fulfillment ${data.id}`)
      } else {
        logger.warn(`[EMAIL][WARN] Failed to queue shipping confirmation for fulfillment ${data.id}`)
      }
    } else {
      logger.warn(`[EMAIL][WARN] No email address for order linked to fulfillment ${data.id} - shipping confirmation skipped`)
    }
  } catch (error: any) {
    logger.error(`[EMAIL][ERROR] Failed to queue shipping confirmation for fulfillment ${data.id}: ${error.message}`)
  }

  // Send admin notification for order shipped
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.FULFILLMENT_CREATED,
      title: "Order Shipped",
      description: `Fulfillment ${data.id} has been created`,
      metadata: { fulfillment_id: data.id },
    })
  } catch (error: any) {
    logger.error(`[ADMIN_NOTIF][ERROR] Failed to send admin notification for fulfillment ${data.id}: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "fulfillment.created",
}
*/
