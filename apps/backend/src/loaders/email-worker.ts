import { MedusaContainer } from "@medusajs/framework/types"
import { startEmailWorker } from "../jobs/email-worker"

/**
 * Loader to start the BullMQ email worker when the Medusa server starts.
 */
export default async function emailWorkerLoader(container: MedusaContainer) {
  try {
    // Only start the worker if Redis is configured
    if (process.env.REDIS_URL) {
      startEmailWorker(container)
      const logger = container.resolve("logger")
      logger.info("[EMAIL] Email worker started")
    } else {
      console.warn("REDIS_URL not configured - email worker not started")
    }
  } catch (error) {
    console.error("CRITICAL: Failed to start email worker:", error)
    throw error
  }
}
