/**
 * Fallback Capture Cron Job
 * 
 * Story 2.4: Safety Net - catches orders with missing BullMQ capture jobs
 * 
 * Runs every hour and checks for orders that:
 * 1. Were created more than 65 minutes ago
 * 2. Have a PaymentIntent in "requires_capture" status
 * 3. Don't have an active BullMQ capture job
 * 
 * This ensures 100% capture even if Redis is flushed or jobs are lost.
 */

import { MedusaContainer } from "@medusajs/framework/types";
import { getPaymentCaptureQueue, getJobState } from "../lib/payment-capture-queue";
import { getStripeClient } from "../utils/stripe";

// 65 minutes = normal 60 min window + 5 min buffer
const STALE_ORDER_THRESHOLD_MS = 65 * 60 * 1000;

/**
 * Fallback capture scheduled job
 */
export default async function fallbackCaptureJob(container: MedusaContainer) {
    console.log("[FallbackCron] Starting fallback capture check...");
    
    const query = container.resolve("query");
    const stripe = getStripeClient();
    
    // Calculate threshold time (65 minutes ago)
    const thresholdTime = new Date(Date.now() - STALE_ORDER_THRESHOLD_MS);
    
    try {
        // Query all orders with Stripe payment intents in metadata
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "metadata", "created_at", "status"],
            filters: {
                created_at: { $lt: thresholdTime },
                status: { $ne: "canceled" },
            },
        });
        
        // Filter to orders with stripe_payment_intent_id
        const ordersWithPaymentIntent = orders.filter((order: any) => 
            order.metadata?.stripe_payment_intent_id
        );
        
        console.log(`[FallbackCron] Found ${ordersWithPaymentIntent.length} orders older than 65 mins with payment intents`);
        
        let capturedCount = 0;
        let skippedCount = 0;
        let alertCount = 0;
        
        for (const order of ordersWithPaymentIntent) {
            const orderId = order.id;
            const paymentIntentId = order.metadata.stripe_payment_intent_id;
            
            try {
                // Step 1: Check Stripe payment status
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                if (paymentIntent.status !== "requires_capture") {
                    // Already captured, canceled, or in another state - skip
                    skippedCount++;
                    continue;
                }
                
                // Step 2: Check BullMQ job state
                const jobState = await getJobState(orderId);
                
                if (jobState === "waiting" || jobState === "active" || jobState === "delayed") {
                    // Job exists and is processing - skip
                    skippedCount++;
                    continue;
                }
                
                if (jobState === "failed") {
                    // Job failed - log critical alert
                    console.error(
                        `[FallbackCron][CRITICAL] Order ${orderId}: Capture job FAILED. ` +
                        `PaymentIntent ${paymentIntentId} still uncaptured. ` +
                        `Manual intervention required!`
                    );
                    console.log(`[METRIC] fallback_capture_alert order=${orderId}`);
                    alertCount++;
                    continue;
                }
                
                // Step 3: Job is MISSING - trigger immediate capture
                console.log(`[FallbackCron] Order ${orderId}: No capture job found, triggering fallback capture`);
                
                // Schedule immediate capture (delay: 0)
                const queue = getPaymentCaptureQueue();
                await queue.add(
                    `fallback-capture-${orderId}`,
                    {
                        orderId,
                        paymentIntentId,
                        scheduledAt: Date.now(),
                    },
                    {
                        delay: 0, // Immediate
                        jobId: `fallback-capture-${orderId}`,
                    }
                );
                
                console.log(`[METRIC] fallback_capture_triggered order=${orderId}`);
                capturedCount++;
                
            } catch (orderError) {
                console.error(`[FallbackCron] Error processing order ${orderId}:`, orderError);
            }
        }
        
        console.log(
            `[FallbackCron] Complete. Captured: ${capturedCount}, Skipped: ${skippedCount}, Alerts: ${alertCount}`
        );
        
    } catch (error) {
        console.error("[FallbackCron] Error running fallback capture job:", error);
    }
}

/**
 * Cron configuration
 * Runs every hour at minute 0
 */
export const config = {
    name: "fallback-capture",
    schedule: "0 * * * *", // Every hour at :00
};
