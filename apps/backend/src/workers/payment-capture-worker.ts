/**
 * Payment Capture Worker
 * 
 * Processes scheduled payment capture jobs using Stripe.
 * 
 * Features:
 * - Story 2.3: Dynamic order total capture
 * - Story 3.2: Metadata updated_total support
 * - Story 6.3: Edit status locking for race condition handling
 */

import { Worker, Job, Queue } from "bullmq";
import { MedusaContainer } from "@medusajs/framework/types";
import { getStripeClient } from "../utils/stripe";
import { PaymentCaptureJobData } from "../types/queue-types";
import { 
    PAYMENT_CAPTURE_QUEUE,
    PAYMENT_CAPTURE_WORKER_CONCURRENCY,
    getRedisConnection,
} from "../lib/payment-capture-queue";

// Avoid accumulating process signal listeners during Jest runs.
const IS_JEST = process.env.JEST_WORKER_ID !== undefined;

let worker: Worker<PaymentCaptureJobData> | null = null;
let shutdownHandler: (() => Promise<void>) | null = null;
let containerRef: MedusaContainer | null = null;

let promoterQueue: Queue<PaymentCaptureJobData> | null = null;
let promoterInterval: NodeJS.Timeout | null = null;

async function getOrderMetadata(orderId: string): Promise<Record<string, any>> {
    if (!containerRef) {
        return {};
    }

    try {
        const query = containerRef.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "metadata"],
            filters: { id: orderId },
        });

        const metadata = (orders?.[0]?.metadata || {}) as Record<string, any>;
        if (metadata && typeof metadata === "object") {
            return metadata;
        }
        return {};
    } catch {
        return {};
    }
}

async function getOrderStatus(orderId: string): Promise<string | undefined> {
    if (!containerRef) {
        return undefined;
    }

    try {
        const query = containerRef.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "status"],
            filters: { id: orderId },
        });

        const status = orders?.[0]?.status as string | undefined;
        return typeof status === "string" ? status : undefined;
    } catch {
        return undefined;
    }
}

async function promoteDueCaptureJobs(): Promise<void> {
    if (!promoterQueue) {
        return;
    }

    try {
        await promoterQueue.promoteJobs();
    } catch (err) {
        console.warn("[PaymentCapture] Failed to promote delayed jobs:", (err as Error)?.message || err);
    }
}

/**
 * Fetch the current order data from Medusa
 * Story 2.3: Ensures we capture the ACTUAL order total, not the original PaymentIntent amount
 * Story 3.2: Now checks metadata.updated_total for orders modified during grace period
 * 
 * Exported for unit testing
 * 
 * @param orderId - The Medusa order ID
 * @returns Object with total in cents, currency code, and status, or null if order not found
 */
export async function fetchOrderTotal(orderId: string): Promise<{ totalCents: number; currencyCode: string; status: string } | null> {
    if (!containerRef) {
        // console.error("[PaymentCapture] Container not initialized - cannot fetch order");
        throw new Error("Container not initialized");
    }

    try {
        const query = containerRef.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "total", "summary", "currency_code", "status", "metadata"],
            filters: { id: orderId },
        });

        if (orders.length === 0) {
            // console.error(`[PaymentCapture] Order ${orderId} not found`);
            throw new Error(`Order ${orderId} not found in DB via query.graph`);
        }

        const order = orders[0];
        
        // Story 3.2: Check metadata.updated_total first for orders modified during grace period
        // The add-item workflow stores updated totals in metadata when items are added
        const metadata = order.metadata as Record<string, any> | undefined;
        let total: number | undefined;

        console.log(`[PaymentCapture] Parsing total for order ${orderId}...`);

        // Story 3.2: Check metadata.updated_total first for orders modified during grace period
        const rawUpdatedTotal = metadata?.updated_total as unknown;
        if (rawUpdatedTotal !== undefined && rawUpdatedTotal !== null) {
            const parsed = typeof rawUpdatedTotal === "number" 
                ? rawUpdatedTotal 
                : parseFloat(String(rawUpdatedTotal));
            
            if (Number.isFinite(parsed)) {
                total = parsed;
                console.log(`[PaymentCapture]   - Using metadata.updated_total: ${total} (original: ${String(rawUpdatedTotal)})`);
            } else {
                console.log(`[PaymentCapture]   - metadata.updated_total found but invalid: ${String(rawUpdatedTotal)}`);
            }
        }

        // Fallback to order.summary if available (Medusa v2 preferred)
        if (total === undefined && order.summary?.current_order_total !== undefined && order.summary?.current_order_total !== null) {
            const summaryTotal = order.summary.current_order_total;
            const parsed = typeof summaryTotal === "number" 
                ? summaryTotal 
                : parseFloat(String(summaryTotal));
                
            if (Number.isFinite(parsed)) {
                total = parsed;
                console.log(`[PaymentCapture]   - Using summary.current_order_total: ${total} (original: ${String(summaryTotal)})`);
            } else {
                console.log(`[PaymentCapture]   - summary.current_order_total found but invalid: ${String(summaryTotal)}`);
            }
        }

        // Fallback to order.total
        if (total === undefined) {
            const rawTotal = (order as any).total;
            const parsed = typeof rawTotal === "number" 
                ? rawTotal 
                : typeof rawTotal === "object" && rawTotal !== null && "numeric_" in rawTotal
                    ? (rawTotal as any).numeric_
                    : parseFloat(String(rawTotal));
                
            if (Number.isFinite(parsed)) {
                total = parsed;
                console.log(`[PaymentCapture]   - Using order.total: ${total} (original: ${String(rawTotal)})`);
            } else {
                console.log(`[PaymentCapture]   - order.total found but invalid: ${String(rawTotal)}`);
            }
        }

        if (total === undefined || !Number.isFinite(total)) {
            const rawTotalForLog = (order as any).total;
            const debugInfo = {
                rawTotalType: typeof rawTotalForLog,
                rawTotalString: String(rawTotalForLog),
                summaryExists: !!order.summary,
                updatedTotalExists: rawUpdatedTotal !== undefined
            };
            console.error(`[PaymentCapture] Order ${orderId} has invalid total calculation:`, debugInfo);
            throw new Error(`Order ${orderId} has invalid total: ${JSON.stringify(rawTotalForLog)} (Debug: ${JSON.stringify(debugInfo)})`);
        }

        // Story 2.3 AC #2: Medusa v2 BigNumber totals are unit amounts (e.g., 147.00 USD).
        // We MUST multiply by 100 to get cents for capture.
        // We no longer guess based on Number.isInteger because "147" (integer) is $147.00, not 147 cents.
        const totalCents = Math.round(total * 100);

        // M1: Fail if currency is missing instead of falling back to USD
        if (!order.currency_code) {
            console.error(`[PaymentCapture] Order ${orderId} has no currency code`);
            return null;
        }

        return {
            totalCents: totalCents,
            currencyCode: order.currency_code,
            status: order.status || "unknown",
        };
    } catch (error) {
        // console.error(`[PaymentCapture] Error fetching order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Story 6.3: Set order edit_status for race condition handling
 * 
 * Uses optimistic locking pattern:
 * 1. Read current state
 * 2. Verify expected state (for lock acquisition)
 * 3. Update with new state and timestamp
 * 
 * Note: This is not a true database-level atomic operation (no FOR UPDATE).
 * The 30s capture buffer (CAPTURE_BUFFER_SECONDS) provides the primary race
 * condition protection. This lock is a secondary guard.
 * 
 * @param orderId - The Medusa order ID
 * @param editStatus - The edit status to set (locked_for_capture, idle, editable)
 * @param expectCurrentStatus - Optional: only update if current status matches
 * @returns true if status was set, false if skipped (e.g., already locked)
 */
export async function setOrderEditStatus(
    orderId: string, 
    editStatus: "locked_for_capture" | "idle" | "editable",
    expectCurrentStatus?: "editable" | "idle" | undefined
): Promise<boolean> {
    if (!containerRef) {
        console.error("[PaymentCapture] Container not initialized - cannot set edit status");
        return false;
    }

    try {
        const currentMetadata = await getOrderMetadata(orderId);

        // Optimistic locking: check current state if expected status specified
        if (expectCurrentStatus !== undefined) {
            const currentStatus = (currentMetadata as any)?.edit_status;
            if (currentStatus === "locked_for_capture") {
                console.warn(`[PaymentCapture] Order ${orderId}: Already locked ('${currentStatus}'), skipping lock acquisition`);
                return false;
            }
        }

        const orderService = containerRef.resolve("order");
        await orderService.updateOrders([{
            id: orderId,
            metadata: {
                ...currentMetadata,
                edit_status: editStatus,
                edit_status_updated_at: new Date().toISOString(),
            },
        }]);
        console.log(`[PaymentCapture] Order ${orderId}: edit_status set to ${editStatus}`);
        return true;
    } catch (error) {
        console.error(`[PaymentCapture] Error setting edit_status for order ${orderId}:`, error);
        throw error; // Re-throw to trigger retry - errors should not be silently swallowed
    }
}

/**
 * Update order metadata to track payment capture status in Medusa
 * Uses metadata since payment_status is not in UpdateOrderDTO
 * @param orderId - The Medusa order ID
 * @param amountCaptured - Amount captured in cents
 */
export async function updateOrderAfterCapture(orderId: string, amountCaptured: number): Promise<void> {
    if (!containerRef) {
        console.error("[PaymentCapture] Container not initialized - cannot update order");
        return;
    }

    try {
        const currentMetadata = await getOrderMetadata(orderId);
        const currentStatus = await getOrderStatus(orderId);

        if (currentStatus === "canceled") {
            console.warn(`[PaymentCapture] Order ${orderId}: Order is canceled in Medusa, not updating status after capture`);
            return;
        }

        const orderService = containerRef.resolve("order");

        const update: any = {
            id: orderId,
            metadata: {
                ...currentMetadata,
                payment_status: "captured",
                payment_captured_at: new Date().toISOString(),
                payment_amount_captured: amountCaptured,
            },
        };

        if (currentStatus !== "completed") {
            update.status = "completed";
        }

        await orderService.updateOrders([update]);
        console.log(`[PaymentCapture] Order ${orderId}: Updated metadata with capture info`);
    } catch (error) {
        console.error(`[PaymentCapture] Error updating order ${orderId} after capture:`, error);
        // Don't throw - payment was captured, metadata update is secondary
    }
}

/**
 * Process a payment capture job
 * Story 2.3: Enhanced to capture dynamic order total instead of static PaymentIntent amount
 * Story 6.3: Added edit_status locking for race condition handling
 * Exported for unit testing
 */
export async function processPaymentCapture(job: Job<PaymentCaptureJobData>): Promise<void> {
    const { orderId, paymentIntentId, scheduledAt } = job.data;
    
    console.log(`[PaymentCapture] Processing capture for order ${orderId}`);

    if (!orderId || typeof orderId !== "string" || !orderId.startsWith("order_")) {
        console.error(`[PaymentCapture][CRITICAL] Invalid orderId in job ${job.id}:`, orderId);
        return;
    }

    if (!paymentIntentId || typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) {
        console.error(`[PaymentCapture][CRITICAL] Invalid paymentIntentId for order ${orderId} in job ${job.id}:`, paymentIntentId);
        return;
    }
    
    const stripe = getStripeClient();
    
    // Story 6.3: Track if we acquired the lock so we know to release it
    let lockAcquired = false;
    
    try {
        // Story 6.3 AC 1, 3: Set edit_status to locked_for_capture BEFORE any capture logic
        lockAcquired = await setOrderEditStatus(orderId, "locked_for_capture");
        
        // Step 1: Get the current state of the payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status === "canceled") {
            console.log(`[PaymentCapture] Order ${orderId}: Payment was already canceled`);
            return;
        }
        
        if (paymentIntent.status === "succeeded") {
            console.log(`[PaymentCapture] Order ${orderId}: Payment was already captured`);
            const alreadyCapturedAmount =
                typeof paymentIntent.amount_received === "number" && paymentIntent.amount_received > 0
                    ? paymentIntent.amount_received
                    : paymentIntent.amount;
            await updateOrderAfterCapture(orderId, alreadyCapturedAmount);
            return;
        }
        
        if (paymentIntent.status !== "requires_capture") {
            console.log(`[PaymentCapture] Order ${orderId}: Unexpected status: ${paymentIntent.status}`);
            return;
        }

        // Step 2: Fetch fresh order total from Medusa (Story 2.3)
        const orderData = await fetchOrderTotal(orderId);
        
        if (!orderData) {
            // Do NOT capture if order data is unavailable; fail for manual review to avoid charging canceled/missing orders
            console.error(`[PaymentCapture][CRITICAL] Order ${orderId}: Could not fetch order details. Aborting capture.`);
            throw new Error(`Could not fetch order details for order ${orderId}`);
        }

        // Guard: Skip capture if order is canceled in Medusa
        if (orderData.status === "canceled") {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId} is canceled in Medusa ` +
                `but PI ${paymentIntentId} still requires capture. Skipping capture.`
            );
            console.log(`[METRIC] capture_blocked_canceled_order order=${orderId}`);
            return;
        }

        const { totalCents, currencyCode } = orderData;
        const authorizedAmount = paymentIntent.amount;

        // M2: Validate currency match
        if (currencyCode.toLowerCase() !== paymentIntent.currency.toLowerCase()) {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Currency mismatch! ` +
                `Order: ${currencyCode}, PaymentIntent: ${paymentIntent.currency}. ` +
                `Cannot capture.`
            );
            throw new Error(`Currency mismatch: Order ${currencyCode} vs PaymentIntent ${paymentIntent.currency}`);
        }

        console.log(`[PaymentCapture] Order ${orderId}: Authorized=${authorizedAmount} cents, Order Total=${totalCents} cents`);

        // Step 3: Handle different capture scenarios
        if (totalCents > authorizedAmount) {
            // EXCESS: Order total increased beyond authorized amount
            // This should not happen normally - would require increment_authorization
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Total (${totalCents}) exceeds authorized amount (${authorizedAmount}). ` +
                `Manual intervention required!`
            );
            throw new Error(`Amount to capture (${totalCents}) exceeds authorized amount (${authorizedAmount})`);
        }

        // Step 4: Capture the dynamic amount with idempotency
        const captured = await stripe.paymentIntents.capture(
            paymentIntentId,
            {
                amount_to_capture: totalCents,
            },
            {
                idempotencyKey: `capture_${orderId}_${scheduledAt}`,
            }
        );

        if (totalCents < authorizedAmount) {
            // PARTIAL: Order total decreased (items removed during grace period)
            // Stripe automatically releases the uncaptured portion
            const released = authorizedAmount - totalCents;
            console.log(
                `[PaymentCapture] Order ${orderId}: Captured ${totalCents} cents, released ${released} cents (${captured.status})`
            );
        } else {
            console.log(`[PaymentCapture] Order ${orderId}: Captured ${totalCents} cents (${captured.status})`);
        }

        // Step 5: Update Medusa order with capture metadata and release lock
        await updateOrderAfterCapture(orderId, totalCents);
        
        // Story 6.3: Release lock after successful capture
        await setOrderEditStatus(orderId, "idle");
        lockAcquired = false; // Mark as released so finally doesn't double-release

    } catch (error: any) {
        // Handle specific Stripe errors using property checks (more robust than instanceof)
        if (error?.type === "invalid_request_error" && error?.code === "amount_too_large") {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Amount too large error. ` +
                `The order total exceeds authorized amount. Manual intervention required!`,
                error
            );
        } else {
            console.error(`[PaymentCapture] Error capturing payment for order ${orderId}:`, error);
        }
        
        throw error; // Re-throw to trigger retry
    } finally {
        // Story 6.3 AC 8: Always release lock in finally block to prevent stuck locks
        if (lockAcquired) {
            try {
                await setOrderEditStatus(orderId, "idle");
            } catch (releaseError) {
                console.error(`[PaymentCapture][CRITICAL] Failed to release lock for order ${orderId}:`, releaseError);
            }
        }
    }
}

/**
 * Start the payment capture worker
 * @param container - Optional Medusa container for accessing services
 */
export function startPaymentCaptureWorker(container?: MedusaContainer): Worker<PaymentCaptureJobData> {
    if (worker) {
        return worker;
    }

    // Store container reference for use in processPaymentCapture
    if (container) {
        containerRef = container;
    }

    const connection = getRedisConnection();
    
    worker = new Worker<PaymentCaptureJobData>(
        PAYMENT_CAPTURE_QUEUE,
        processPaymentCapture,
        {
            connection,
            concurrency: PAYMENT_CAPTURE_WORKER_CONCURRENCY,
        }
    );

    if (!IS_JEST) {
        promoterQueue = new Queue<PaymentCaptureJobData>(PAYMENT_CAPTURE_QUEUE, { connection });
        void promoteDueCaptureJobs();
        promoterInterval = setInterval(() => {
            void promoteDueCaptureJobs();
        }, 5000);
        promoterInterval.unref?.();
    }

    worker.on("completed", (job) => {
        console.log(`[PaymentCapture] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
        const attemptsMade = job?.attemptsMade || 0;
        const maxAttempts = job?.opts?.attempts || 3;
        
        if (attemptsMade >= maxAttempts) {
            // CRITICAL: Job has exhausted all retries - revenue at risk
            console.error(
                `[CRITICAL][DLQ] Payment capture PERMANENTLY FAILED for order ${job?.data?.orderId}. ` +
                `PaymentIntent: ${job?.data?.paymentIntentId}. Attempts: ${attemptsMade}/${maxAttempts}. ` +
                `Manual intervention required!`,
                err
            );
            // TODO: Integrate with alerting service (PagerDuty, Slack webhook, etc.)
        } else {
            console.error(
                `[PaymentCapture] Job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts}):`,
                err
            );
        }
    });

    console.log("[PaymentCapture] Worker started");

    // Graceful shutdown (register once). Skip in Jest to avoid listener accumulation.
    if (!shutdownHandler && !IS_JEST) {
        shutdownHandler = async () => {
            console.log("[PaymentCapture] Shutting down worker...");
            await worker?.close();

            if (promoterInterval) {
                clearInterval(promoterInterval);
                promoterInterval = null;
            }

            if (promoterQueue) {
                await promoterQueue.close();
                promoterQueue = null;
            }
        };
        process.on("SIGTERM", shutdownHandler);
        process.on("SIGINT", shutdownHandler);
    }

    return worker;
}

/**
 * Shuts down the payment capture worker.
 * Essential for testing to prevent open handles.
 */
export async function shutdownPaymentCaptureWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}

/**
 * Set container reference (for testing)
 */
export function setContainerRef(container: MedusaContainer | null) {
    containerRef = container;
}
