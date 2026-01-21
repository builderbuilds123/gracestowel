import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { startEmailWorker } from "../workers/email-worker"
import { cancelPaymentCaptureJob } from "../lib/payment-capture-queue"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"
import { trackEvent } from "../utils/analytics"
import { logger } from "../utils/logger"

interface OrderCanceledEventData {
  id: string;
  reason?: string;
}

export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderCanceledEventData>) {
  // Ensure Email worker is running (lazy init)
  if (process.env.REDIS_URL) {
    startEmailWorker(container)
  }

  // const logger = container.resolve("logger")
  logger.info("order-canceled", "Order canceled event received", { order_id: data.id })
  await trackEvent(container, "order.canceled", {
    properties: {
      order_id: data.id,
      reason: data.reason,
    },
  })

  // Cancel any scheduled payment capture job
  try {
    const canceled = await cancelPaymentCaptureJob(data.id)
    if (canceled) {
      logger.info("payment-capture", "Payment capture job canceled", { order_id: data.id })
    }
  } catch (error: any) {
    logger.error("payment-capture", "Failed to cancel payment capture job", { order_id: data.id }, error)
  }

  // Send order canceled email via BullMQ
  try {
    const query = container.resolve("query")
    const { data: orders } = await query.graph({
      entity: "order",
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
      filters: { id: data.id },
    })

    const order = orders[0]
    if (!order) {
      logger.error("email-queue", "Order not found for cancellation email", { order_id: data.id })
      return
    }

    if (order.email) {
      const result = await enqueueEmail({
        entityId: order.id,
        template: Templates.ORDER_CANCELED,
        recipient: order.email,
        data: {
          order: {
            id: order.id,
            email: order.email,
            total: order.total,
            currency_code: order.currency_code,
            canceled_at: order.canceled_at,
            items: (order.items || [])
              .filter((item: any) => item != null)
              .map((item: any) => ({
                title: item.variant?.product?.title || item.product_title || item.title || "Unknown Product",
                variant_title: item.variant?.title || item.variant_title,
                quantity: item.quantity,
                unit_price: item.unit_price,
              })),
          },
          reason: data.reason,
        },
      })
      if (result) {
        logger.info("email-queue", "Order canceled email queued", { order_id: data.id })
      } else {
        logger.warn("email-queue", "Failed to queue cancellation email", { order_id: data.id })
      }
    } else {
      logger.warn("email-queue", "No email address for order - cancellation email skipped", { order_id: data.id })
    }
  } catch (error: any) {
    logger.error("email-queue", "Failed to queue cancellation email", { order_id: data.id }, error)
  }

  // Send admin notification for canceled order
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.ORDER_CANCELED,
      title: "Order Canceled",
      description: `Order ${data.id} has been canceled${data.reason ? `: ${data.reason}` : ""}`,
      metadata: { order_id: data.id, reason: data.reason },
    })
  } catch (error: any) {
    logger.error("admin-notification", "Failed to send admin notification for order cancellation", { order_id: data.id }, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
