import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { startEmailWorker } from "../workers/email-worker"
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
  // Ensure Email worker is running (lazy init)
  if (process.env.REDIS_URL) {
    startEmailWorker(container)
  }

  const logger = container.resolve("logger")
  logger.info(`[ORDER_CANCELED] Order canceled event received: ${data.id}`)

  // Cancel any scheduled payment capture job
  try {
    const canceled = await cancelPaymentCaptureJob(data.id)
    if (canceled) {
      logger.info(`[CAPTURE_CANCEL] Payment capture job canceled for order ${data.id}`)
    }
  } catch (error: any) {
    logger.error(`[CAPTURE_CANCEL][ERROR] Failed to cancel payment capture job for order ${data.id}: ${error.message}`)
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
    if (order?.email) {
      await enqueueEmail({
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
      logger.info(`[EMAIL][QUEUE] Order canceled email queued for order ${data.id}`)
    } else {
      logger.warn(`[EMAIL][WARN] No email address for order ${data.id} - cancellation email skipped`)
    }
  } catch (error: any) {
    logger.error(`[EMAIL][ERROR] Failed to queue cancellation email for order ${data.id}: ${error.message}`)
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
    logger.error(`[ADMIN_NOTIF][ERROR] Failed to send admin notification for order cancellation ${data.id}: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}

