import { Worker, Job } from "bullmq"
import { MedusaContainer } from "@medusajs/framework/types"
import { EmailJobPayload } from "../lib/email-queue"
import { maskEmail } from "../utils/email-masking"
import ResendNotificationProviderService from "../modules/resend/service"

const QUEUE_NAME = "email-queue"

let emailWorker: Worker<EmailJobPayload> | null = null

/**
 * Get Redis connection options from environment
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured")
  }

  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  }
}

export function startEmailWorker(container: MedusaContainer): Worker<EmailJobPayload> {
  if (emailWorker) {
    return emailWorker
  }

  const logger = container.resolve("logger")
  const resendService = container.resolve("resendNotificationProviderService") as ResendNotificationProviderService

  emailWorker = new Worker<EmailJobPayload>(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      const { orderId, template, recipient, data } = job.data
      const maskedRecipient = maskEmail(recipient)

      logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}, attempt ${job.attemptsMade + 1}/3`)

      try {
        // Call Resend service to send email
        await resendService.send({
          to: recipient,
          template: template,
          data: data,
          channel: "email", // Required by ProviderSendNotificationDTO
        })

        logger.info(`[EMAIL][SENT] Sent ${template} to ${maskedRecipient} for order ${orderId}`)
      } catch (error: any) {
        logger.error(`[EMAIL][FAILED] Failed ${template} for order ${orderId}: ${error.message}`)
        throw error // Re-throw to trigger BullMQ retry
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5, // Process up to 5 emails concurrently
    }
  )

  // Log worker events
  emailWorker.on("completed", (job) => {
    logger.info(`[EMAIL][COMPLETE] Job ${job.id} completed`)
  })

  emailWorker.on("failed", (job, error) => {
    logger.error(`[EMAIL][JOB_FAILED] Job ${job?.id} failed: ${error.message}`)
  })

  return emailWorker
}

/**
 * Reset the worker singleton (for testing only)
 */
export function resetEmailWorkerForTests() {
  emailWorker = null
}
