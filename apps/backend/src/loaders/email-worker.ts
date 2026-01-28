import { MedusaContainer } from "@medusajs/framework/types";
import { startEmailWorker } from "../workers/email-worker";
import { logger } from "../utils/logger";

/**
 * Loader to start the BullMQ email worker when the Medusa server starts.
 */
export default async function emailWorkerLoader(container: MedusaContainer) {
    try {
        const isIntegrationTest = process.env.TEST_TYPE?.startsWith("integration");
        if (isIntegrationTest) {
            return;
        }

        // Only start the worker if Redis is configured
        if (process.env.REDIS_URL) {
            startEmailWorker(container);
            logger.info("email-worker-loader", "Email worker started successfully");
        } else {
            logger.warn("email-worker-loader", "REDIS_URL not configured - email worker not started");
        }
    } catch (error) {
        logger.critical("email-worker-loader", "Failed to start email worker", {}, error instanceof Error ? error : new Error(String(error)));
        // Don't throw to prevent blocking main server boot, but log critical error
    }
}
