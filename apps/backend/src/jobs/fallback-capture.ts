/**
 * Fallback Capture Logic (Safety Net)
 * 
 * Runs every hour to catch orders that:
 * 1. Are fulfilled (or have items fulfilled)
 * 2. Are NOT PAID (payment_status != captured, partial_captured, etc)
 * 3. Have "escaped" the real-time capture workflow (e.g., job failed, redis lost)
 * 
 * Action: Triggers immediate capture via queue.
 */

import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getPaymentCaptureQueue } from "../lib/payment-capture-queue";
import { getStripeClient } from "../utils/stripe";
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications";

// One hour buffer to allow normal workflow to complete
const SAFETY_BUFFER_MS = 60 * 60 * 1000;

export default async function fallbackCaptureJob(container: MedusaContainer) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info("[FallbackCapturer] Starting safety check...");

    // Guard: Check Redis
    if (!process.env.REDIS_URL) {
        logger.warn("[FallbackCapturer] REDIS_URL not configured - skipping");
        return;
    }
    
    // Guard: Check Queue
    let queue;
    try {
        queue = getPaymentCaptureQueue();
    } catch (e) {
        return;
    }

    const query = container.resolve("query");
    const stripe = getStripeClient();
    const thresholdTime = new Date(Date.now() - SAFETY_BUFFER_MS);

    try {
        // Query: Orders that are fulfilled but not "captured" or "partially_captured"
        // And are older than 1 hour (to avoid race conditions with active workflows)
        // Medusa v2 Statuses: pending, completed, canceled, archived, requires_action
        // Payment Statuses: not_paid, awaiting, authorized, part_authorized, captured...
        // Fulfillment Statuses: not_fulfilled, fulfilled, partially_fulfilled...
        
        // We look for:
        // Fulfillment NOT not_fulfilled (meaning something shipped)
        // Payment NOT captured AND NOT partially_captured
        
        const { data: candidates } = await query.graph({
            entity: "order",
            fields: ["id", "metadata", "created_at", "status", "payment_status", "fulfillment_status"],
            filters: {
                created_at: { $lt: thresholdTime },
                fulfillment_status: { $startWith: "fulfilled" }, // fulfilled, partially_fulfilled? Medusa uses Exact match typically but let's be safe.
                // In query.graph filters, we might need explicit values.
                // Or filter in memory if volume is low.
                // Let's filter in memory for complex logic to be safe.
                 "created_at": { $lt: thresholdTime },
                 "status": "pending", // Only pending orders need action. Completed are done.
            },
        });

        // In-memory filter for specific business logic
        const ordersToRecover = candidates.filter((order: any) => {
            const isShipped = ["fulfilled", "partially_fulfilled", "shipped", "partially_shipped"].includes(order.fulfillment_status);
            const isUnpaid = ["not_paid", "authorized", "awaiting"].includes(order.payment_status);
            
            // Only recover if shipped AND unpaid
            return isShipped && isUnpaid;
        });

        if (ordersToRecover.length === 0) {
            logger.info("[FallbackCapturer] No at-risk orders found. System healthy.");
            return;
        }

        logger.warn(`[FallbackCapturer] Found ${ordersToRecover.length} orders that are fulfilled but not captured! Triggering recovery.`);

        for (const order of ordersToRecover) {
             const paymentIntentId = order.metadata?.stripe_payment_intent_id;
             if (!paymentIntentId) {
                 logger.error(`[FallbackCapturer] Order ${order.id} has no PI in metadata. Manual check required.`);
                 continue;
             }

             // Verify Stripe status (real-time check)
             const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
             if (pi.status !== "requires_capture") {
                 logger.info(`[FallbackCapturer] Order ${order.id} PI is ${pi.status}. Skipping.`);
                 continue;
             }
             
             // Trigger Immediate Capture
             logger.info(`[FallbackCapturer] Triggering immediate capture for ${order.id}`);
             
             await queue.add(
                `capture-${order.id}`,
                {
                    orderId: order.id,
                    paymentIntentId,
                    scheduledAt: Date.now(),
                    source: "safety_net_fallback",
                },
                {
                    delay: 0, // IMMEDIATE
                    jobId: `safety_capture_${order.id}_${Date.now()}`,
                }
            );

            // Notify Admin
            await sendAdminNotification(container, {
                type: AdminNotificationType.ORDER_SYSTEM_ALERT,
                title: "Safety Net Triggered",
                description: `Order ${order.id} was fulfilled but payment was not captured. Fallback job has triggered immediate capture.`,
                metadata: { order_id: order.id }
            });
        }

    } catch (error) {
        logger.error("[FallbackCapturer] Job failed", error);
    }
}

export const config = {
    name: "fallback-capture",
    schedule: "0 * * * *", // Every hour
};
