import { MedusaContainer } from "@medusajs/framework/types";
import { startPaymentCaptureWorker } from "../workers/payment-capture-worker";

/**
 * Loader to start the BullMQ payment capture worker when the Medusa server starts.
 * 
 * This worker processes delayed jobs that capture payments after the 1-hour
 * modification window expires.
 * 
 * Story 2.3: Now passes the container to enable fetching fresh order totals.
 */
export default async function paymentCaptureWorkerLoader(container: MedusaContainer) {
    try {
        // Only start the worker if Redis is configured
        if (process.env.REDIS_URL) {
            // Pass container to worker for accessing Medusa services (Story 2.3)
            startPaymentCaptureWorker(container);
        } else {
            console.warn("REDIS_URL not configured - payment capture worker not started");
        }
    } catch (error) {
        // H2: Fail loudness
        console.error("CRITICAL: Failed to start payment capture worker:", error);
        throw error;
    }
}
