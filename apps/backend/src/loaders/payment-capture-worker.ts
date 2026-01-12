import { MedusaContainer } from "@medusajs/framework/types";
import { startPaymentCaptureWorker } from "../workers/payment-capture-worker";
import { RedisNotConfiguredError } from "../lib/payment-capture-queue";

/**
 * Loader to start the BullMQ payment capture worker when the Medusa server starts.
 *
 * This worker processes delayed jobs that capture payments after the
 * modification window expires (configured via PAYMENT_CAPTURE_DELAY_MS).
 *
 * Story 2.3: Now passes the container to enable fetching fresh order totals.
 */
export default async function paymentCaptureWorkerLoader(container: MedusaContainer) {
    try {
        // Pass container to worker for accessing Medusa services (Story 2.3)
        startPaymentCaptureWorker(container);
    } catch (error) {
        if (error instanceof RedisNotConfiguredError) {
            console.warn("REDIS_URL not configured - payment capture worker not started");
            return;
        }

        // H2: Fail loudness
        console.error("CRITICAL: Failed to start payment capture worker:", error);
        throw error;
    }
}
