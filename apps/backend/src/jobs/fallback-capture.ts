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
    if (!process.env.REDIS_URL) {
        console.warn("[FallbackCron] REDIS_URL not configured - skipping fallback capture run");
        return;
    }
    
    // Guard: Check if Redis/BullMQ is available
    let queue;
    try {
        queue = getPaymentCaptureQueue();
    } catch (error) {
        console.error("[FallbackCron] Redis not available - skipping fallback capture check. This is expected in non-production environments.", error);
        return;
    }
    
    const query = container.resolve("query");
    const stripe = getStripeClient();
    
    // Calculate threshold time (65 minutes ago)
    const thresholdTime = new Date(Date.now() - STALE_ORDER_THRESHOLD_MS);
    
    try {
        // Query orders that are PENDING with Stripe payment intents
        // Only pending orders should be checked - processing/completed orders should be skipped
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "metadata", "created_at", "status"],
            filters: {
                created_at: { $lt: thresholdTime },
                status: "pending", // Only pending orders - processing/completed should not be re-captured
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
                // Double-check status defensively in case state changed after query
                if (order.status !== "pending") {
                    console.warn(
                        `[FallbackCron][WARN] Order ${orderId} has status '${order.status}' but was expected to be 'pending'. Skipping.`
                    );
                    skippedCount++;
                    continue;
                }
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
                
                // Step 3: Job is MISSING or COMPLETED - trigger immediate capture
                // Use same job ID pattern as normal captures for deduplication
                console.log(`[FallbackCron] Order ${orderId}: No active capture job found (state: ${jobState}), triggering fallback capture`);
                
                // Schedule immediate capture (delay: 0)
                // Uses `capture-${orderId}` pattern for consistency with getJobState()
                await queue.add(
                    `capture-${orderId}`,
                    {
                        orderId,
                        paymentIntentId,
                        scheduledAt: Date.now(),
                    },
                    {
                        delay: 0, // Immediate
                        jobId: `capture-${orderId}`, // Same pattern as normal captures for deduplication
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
