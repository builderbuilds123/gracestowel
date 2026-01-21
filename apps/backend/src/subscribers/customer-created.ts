import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { startEmailWorker } from "../workers/email-worker"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"
import { trackEvent } from "../utils/analytics"

export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  // Ensure Email worker is running (lazy init)
  if (process.env.REDIS_URL) {
    startEmailWorker(container)
  }

  const logger = container.resolve("logger")
  logger.info(`[CUSTOMER_CREATED] Customer created event received: ${data.id}`)
  await trackEvent(container, "customer.created", {
    actorId: data.id,
    properties: {
      customer_id: data.id,
    },
  })
  
  try {
    const query = container.resolve("query")
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: data.id },
    })

    const customer = customers[0]
    if (!customer) {
      logger.error(`[EMAIL][ERROR] Customer ${data.id} not found for welcome email`)
      return
    }

    if (customer.email) {
      const result = await enqueueEmail({
        entityId: customer.id,
        template: Templates.WELCOME,
        recipient: customer.email,
        data: {
          customer: {
            id: customer.id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
          },
        },
      })
      if (result) {
        logger.info(`[EMAIL][QUEUE] Welcome email queued for customer ${data.id}`)
      } else {
        logger.warn(`[EMAIL][WARN] Failed to queue welcome email for customer ${data.id}`)
      }
    } else {
      logger.warn(`[EMAIL][WARN] No email address for customer ${data.id} - welcome email skipped`)
    }
  } catch (error: any) {
    logger.error(`[EMAIL][ERROR] Failed to queue welcome email for customer ${data.id}: ${error.message}`)
  }

  // Send admin notification for new customer signup
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.CUSTOMER_CREATED,
      title: "New Customer Signup",
      description: `Customer ${data.id} has signed up`,
      metadata: { customer_id: data.id },
    })
  } catch (error: any) {
    logger.error(`[ADMIN_NOTIF][ERROR] Failed to send admin notification for customer ${data.id}: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
}
