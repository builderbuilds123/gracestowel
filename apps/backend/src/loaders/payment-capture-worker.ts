import { MedusaContainer } from "@medusajs/framework/types";
import { startPaymentCaptureWorker } from "../lib/payment-capture-queue";

/**
 * Loader to start the BullMQ payment capture worker when the Medusa server starts.
 * 
 * This worker processes delayed jobs that capture payments after the 1-hour
 * modification window expires.
 */
export default async function paymentCaptureWorkerLoader(container: MedusaContainer) {
    try {
        // Only start the worker if Redis is configured
        if (process.env.REDIS_URL) {
            startPaymentCaptureWorker();
            console.log("Payment capture worker loader initialized");
        } else {
            console.warn("REDIS_URL not configured - payment capture worker not started");
        }
    } catch (error) {
        console.error("Failed to start payment capture worker:", error);
    }
}

