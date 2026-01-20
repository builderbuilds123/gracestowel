import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { startEmailWorker } from "../workers/email-worker"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"
import { trackEvent } from "../utils/analytics"

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
      ],
      filters: { id: data.id },
    })

    const fulfillment = fulfillments[0]
    if (fulfillment?.order?.email) {
      await enqueueEmail({
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
      logger.info(`[EMAIL][QUEUE] Shipping confirmation email queued for fulfillment ${data.id}`)
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
