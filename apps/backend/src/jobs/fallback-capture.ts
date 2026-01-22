/**
 * Fallback Capture Cron Job
 * 
 * Story 2.4: Safety Net - catches orders with missing BullMQ capture jobs
 * Story 6.2: Recovery Mode - processes orders flagged with needs_recovery: true
 * 
 * Runs every hour and checks for orders that:
 * 1. Were created more than 65 minutes ago (stale orders)
 * 2. Have needs_recovery: true in metadata (Redis failure recovery)
 * 3. Have a PaymentIntent in "requires_capture" status
 * 4. Don't have an active BullMQ capture job
 * 
 * This ensures 100% capture even if Redis is flushed or jobs are lost.
 */

import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getPaymentCaptureQueue, getJobState } from "../lib/payment-capture-queue";
import { getStripeClient } from "../utils/stripe";
import { trackEvent } from "../utils/analytics";
import { getPendingRecoveryOrders, PgConnection } from "../repositories/order-recovery";

// 65 minutes = normal 60 min window + 5 min buffer
const STALE_ORDER_THRESHOLD_MS = 65 * 60 * 1000;

/**
 * Fallback capture scheduled job
 */
export default async function fallbackCaptureJob(container: MedusaContainer) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info("[FallbackCron] Starting fallback capture check...");

    // DEBUG: Log when fallback cron runs
    logger.info("[FallbackCron][DEBUG] ====== FALLBACK CRON EXECUTING ======");
    logger.info(`[FallbackCron][DEBUG] Current time: ${new Date().toISOString()}`);
    logger.info(`[FallbackCron][DEBUG] Stale threshold: ${STALE_ORDER_THRESHOLD_MS}ms (${STALE_ORDER_THRESHOLD_MS / 60000} minutes)`);
    logger.info(`[FallbackCron][DEBUG] Orders older than: ${new Date(Date.now() - STALE_ORDER_THRESHOLD_MS).toISOString()}`);
    logger.info("[FallbackCron][DEBUG] =====================================");
    if (!process.env.REDIS_URL) {
        logger.warn("[FallbackCron] REDIS_URL not configured - skipping fallback capture run");
        return;
    }
    
    // Guard: Check if Redis/BullMQ is available
    const queue = (() => {
        try {
            return getPaymentCaptureQueue();
        } catch (error) {
            logger.error("[FallbackCron] Redis not available - skipping fallback capture check. This is expected in non-production environments.", error);
            return null;
        }
    })();

    if (!queue) {
        return;
    }
    
    const query = container.resolve("query");
    // Use PG_CONNECTION for raw SQL queries in Medusa v2
    const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as PgConnection;
    const orderService = container.resolve("order");
    const stripe = getStripeClient();
    
    // Calculate threshold time (65 minutes ago)
    const thresholdTime = new Date(Date.now() - STALE_ORDER_THRESHOLD_MS);
    
    try {
        // Query stale orders (older than threshold) that are pending
        const { data: staleOrders } = await query.graph({
            entity: "order",
            fields: ["id", "metadata", "created_at", "status"],
            filters: {
                created_at: { $lt: thresholdTime },
                status: "pending",
            },
        });

        const staleOrdersWithPaymentIntent = staleOrders.filter((order: any) =>
            order.metadata?.stripe_payment_intent_id
        );

        // Query recovery orders via SQL to avoid full-table scans on JSONB
        const recoveryOrders = await getPendingRecoveryOrders(pgConnection);

        const orderMap = new Map<string, any>();

        for (const order of staleOrdersWithPaymentIntent) {
            orderMap.set(order.id, { ...order, source: "stale" });
        }

        for (const order of recoveryOrders) {
            const existing = orderMap.get(order.id);
            const source = existing ? "both" : "recovery";
            orderMap.set(order.id, { ...order, source });
        }

        const ordersToProcess = Array.from(orderMap.values());
        const staleCount = ordersToProcess.filter(o => o.source === "stale" || o.source === "both").length;
        const recoveryOnlyCount = ordersToProcess.filter(o => o.source === "recovery").length;

        logger.info(`[FallbackCron] Found ${staleCount} stale orders, ${recoveryOnlyCount} recovery-only orders (${ordersToProcess.length} total to process)`);
        
        let capturedCount = 0;
        let skippedCount = 0;
        let alertCount = 0;
        let recoveryCount = 0;
        
        for (const order of ordersToProcess) {
            const orderId = order.id;
            const paymentIntentId = order.metadata.stripe_payment_intent_id;
            const isRecoveryOrder = order.metadata?.needs_recovery === true;
            
            try {
                // Double-check status defensively in case state changed after query
                if (order.status !== "pending") {
                    logger.warn(
                        `[FallbackCron][WARN] Order ${orderId} has status '${order.status}' but was expected to be 'pending'. Skipping.`
                    );
                    skippedCount++;
                    continue;
                }
                // Step 1: Check Stripe payment status
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                if (paymentIntent.status !== "requires_capture") {
                    // Already captured, canceled, or in another state - skip
                    // If this was a recovery order, clear the flag since it's already handled
                    if (isRecoveryOrder) {
                        await clearRecoveryFlag(orderService, orderId, order.metadata);
                        logger.info(`[FallbackCron][RECOVERY] Order ${orderId}: Payment already processed, cleared recovery flag`);
                    }
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
                    logger.error(
                        `[FallbackCron][CRITICAL] Order ${orderId}: Capture job FAILED. ` +
                        `PaymentIntent ${paymentIntentId} still uncaptured. ` +
                        `Manual intervention required!`
                    );
                    logger.info(`[METRIC] fallback_capture_alert order=${orderId}`);
                    alertCount++;
                    continue;
                }
                
                // Step 3: Job is MISSING or COMPLETED - trigger immediate capture
                const sourceLabel = isRecoveryOrder ? "RECOVERY" : "FALLBACK";
                logger.info(`[FallbackCron][${sourceLabel}] Order ${orderId}: No active capture job found (state: ${jobState}), triggering capture`);

                // DEBUG: Log immediate capture trigger
                logger.info(`[FallbackCron][DEBUG] ====== TRIGGERING IMMEDIATE CAPTURE ======`);
                logger.info(`[FallbackCron][DEBUG] Order ID: ${orderId}`);
                logger.info(`[FallbackCron][DEBUG] Order created at: ${order.created_at}`);
                logger.info(`[FallbackCron][DEBUG] Order age: ${Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000)} minutes`);
                logger.info(`[FallbackCron][DEBUG] Job state was: ${jobState}`);
                logger.info(`[FallbackCron][DEBUG] Is recovery order: ${isRecoveryOrder}`);
                logger.info(`[FallbackCron][DEBUG] Source: ${sourceLabel}`);
                logger.info(`[FallbackCron][DEBUG] DELAY: 0 (IMMEDIATE)`);
                logger.info(`[FallbackCron][DEBUG] ==========================================`);

                // Schedule immediate capture (delay: 0)
                await queue.add(
                    `capture-${orderId}`,
                    {
                        orderId,
                        paymentIntentId,
                        scheduledAt: Date.now(),
                        source: isRecoveryOrder ? "redis_recovery" : "fallback",
                    },
                    {
                        delay: 0,
                        jobId: `capture-${orderId}`,
                    }
                );
                
                // Step 4: Clear recovery flag if this was a recovery order
                if (isRecoveryOrder) {
                    await clearRecoveryFlag(orderService, orderId, order.metadata);
                    recoveryCount++;
                    
                    await trackEvent(container, "recovery.redis_triggered", {
                        properties: {
                            order_id: orderId,
                            recovery_reason: order.metadata?.recovery_reason || "unknown",
                        },
                    });
                    logger.info(`[METRIC] redis_recovery_triggered order=${orderId}`);
                } else {
                    await trackEvent(container, "capture.fallback.triggered", {
                        properties: {
                            order_id: orderId,
                            source: "fallback",
                        },
                    });
                    logger.info(`[METRIC] fallback_capture_triggered order=${orderId}`);
                }
                
                capturedCount++;
                
            } catch (orderError) {
                logger.error(`[FallbackCron] Error processing order ${orderId}:`, orderError);
            }
        }
        
        logger.info(
            `[FallbackCron] Complete. Captured: ${capturedCount}, Recovered: ${recoveryCount}, Skipped: ${skippedCount}, Alerts: ${alertCount}`
        );
        
    } catch (error) {
        logger.error("[FallbackCron] Error running fallback capture job:", error);
    }
}

/**
 * Helper: Clear recovery metadata from order
 */
async function clearRecoveryFlag(orderService: any, orderId: string, currentMetadata: any) {
    const { needs_recovery, recovery_reason, ...cleanMetadata } = currentMetadata || {};
    await orderService.updateOrders([{
        id: orderId,
        metadata: cleanMetadata,
    }]);
}

/**
 * Cron configuration
 * Runs every hour at minute 0
 */
export const config = {
    name: "fallback-capture",
    schedule: "0 * * * *", // Every hour at :00
};
