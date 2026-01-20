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
import { Modules } from "@medusajs/framework/utils";
import { getStripeClient } from "../utils/stripe";
import { PaymentCaptureJobData } from "../types/queue-types";
import {
    PaymentCollectionStatus,
    validatePaymentCollectionStatus,
    isTerminalStatus,
    type PaymentCollectionStatusType,
} from "../types/payment-collection-status";
import {
    PAYMENT_CAPTURE_QUEUE,
    PAYMENT_CAPTURE_WORKER_CONCURRENCY,
    getRedisConnection,
} from "../lib/payment-capture-queue";
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications";

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

        // Story 2.3 AC2: Medusa v2 BigNumber totals are unit amounts (e.g., 147.00 USD).
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

async function getPaymentInfoForOrder(orderId: string): Promise<{ paymentCollectionId: string | null; paymentId: string | null }> {
    if (!containerRef) {
        return { paymentCollectionId: null, paymentId: null };
    }

    try {
        const query = containerRef.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "payment_collections.id",
                "payment_collections.payments.id",
            ],
            filters: { id: orderId },
        });

        const order = orders?.[0];
        if (!order) {
            return { paymentCollectionId: null, paymentId: null };
        }

        const paymentCollection = order.payment_collections?.[0];
        const paymentId = paymentCollection?.payments?.[0]?.id as string | undefined;

        return {
            paymentCollectionId: paymentCollection?.id ?? null,
            paymentId: paymentId ?? null,
        };
    } catch (error) {
        console.error(`[PAY-01][ERROR] Failed to retrieve payment info for order ${orderId}:`, error);
        return { paymentCollectionId: null, paymentId: null };
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
 * Update order after payment capture - NO BACKWARD COMPATIBILITY
 *
 * PAY-01: Updates PaymentCollection status to "completed" (REQUIRED)
 * AC3: Payment capture uses Payment Module APIs
 * AC4: Creates OrderTransaction for capture (for downstream RET-01 compatibility)
 *
 * BREAKING CHANGE: Orders without PaymentCollection will FAIL LOUDLY
 * No fallback to metadata.payment_status - deprecated pattern removed
 *
 * @param orderId - The Medusa order ID
 * @param amountCaptured - Amount captured in cents
 */
export async function updateOrderAfterCapture(orderId: string, amountCaptured: number): Promise<void> {
    if (!containerRef) {
        console.error("[PaymentCapture] Container not initialized - cannot update order");
        throw new Error("Container not initialized - critical payment infrastructure unavailable");
    }

    let currencyCode = "usd"; // Default fallback

    try {
        const currentStatus = await getOrderStatus(orderId);

        if (currentStatus === "canceled") {
            console.warn(`[PaymentCapture] Order ${orderId}: Order is canceled in Medusa, not updating status after capture`);
            return;
        }

        // Get currency code for OrderTransaction
        try {
            const query = containerRef.resolve("query");
            const { data: orders } = await query.graph({
                entity: "order",
                fields: ["id", "currency_code"],
                filters: { id: orderId },
            });
            if (orders?.[0]?.currency_code) {
                currencyCode = orders[0].currency_code;
            }
        } catch {
            // Fall back to USD if we can't get currency
        }

        // PAY-01: Update PaymentCollection status (REQUIRED - no backward compatibility)
        const { paymentCollectionId, paymentId } = await updatePaymentCollectionOnCapture(orderId, amountCaptured);

        // FAIL LOUDLY if no PaymentCollection found (deprecated metadata pattern removed)
        if (!paymentCollectionId) {
            console.error(
                `[PAY-01][CRITICAL] Order ${orderId} has no PaymentCollection! ` +
                `Payment was captured in Stripe but cannot update canonical payment status. ` +
                `This order was likely created before PAY-01 deployment and is not supported.`
            );
            throw new Error(
                `Order ${orderId} missing PaymentCollection - cannot update payment status. ` +
                `Pre-PAY-01 orders are not supported. Manual intervention required.`
            );
        }

        // PAY-01 AC4: Create OrderTransaction for capture
        await createOrderTransactionOnCapture(orderId, amountCaptured, currencyCode, paymentCollectionId, paymentId);

        // Update order status to completed if not already
        if (currentStatus !== "completed") {
            const orderService = containerRef.resolve("order");
            await orderService.updateOrders([{
                id: orderId,
                status: "completed"
            }]);
            console.log(`[PaymentCapture] Order ${orderId}: Status updated to completed`);
        }

    } catch (error) {
        console.error(`[PaymentCapture] Error updating order ${orderId} after capture:`, error);
        // Re-throw - payment status update is CRITICAL, not secondary
        throw error;
    }
}

/**
 * PAY-01: Update PaymentCollection status on capture - NO BACKWARD COMPATIBILITY
 *
 * AC3: Updates PaymentCollection via Payment Module service
 *
 * BREAKING CHANGE: Returns null if no PaymentCollection found
 * Pre-PAY-01 orders (without PaymentCollection) are NOT SUPPORTED
 * Caller must fail loudly if null is returned
 *
 * @param orderId - The Medusa order ID
 * @param amountCaptured - Amount captured in cents
 * @returns The PaymentCollection ID if found, null if order has no PaymentCollection (CRITICAL ERROR)
 */
type PaymentCollectionInfo = { paymentCollectionId: string | null; paymentId: string | null };

async function updatePaymentCollectionOnCapture(orderId: string, amountCaptured: number): Promise<PaymentCollectionInfo> {
    if (!containerRef) {
        console.error(
            `[PAY-01][CRITICAL] Container not initialized - cannot update PaymentCollection for order ${orderId}. ` +
            `Payment was captured in Stripe but PaymentCollection status will not be updated.`
        );
        console.log(`[METRIC] payment_collection_update_blocked order=${orderId} reason=no_container`);
        return { paymentCollectionId: null, paymentId: null };
    }

    // Declare paymentCollection outside try block for catch block access
    let paymentCollection: any = null;

    try {
        const query = containerRef.resolve("query");
        
        // Get order with payment collections
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "payment_collections.id",
                "payment_collections.status",
                "payment_collections.payments.id",
            ],
            filters: { id: orderId },
        });

        const order = orders?.[0];
        if (!order) {
            console.warn(`[PAY-01] Order ${orderId} not found for PaymentCollection update`);
            return { paymentCollectionId: null, paymentId: null };
        }

        // REVIEW FIX: Find the capturable PaymentCollection instead of blindly using the first one
        // Capturable statuses are those that can transition to "completed": "authorized", "awaiting", etc.
        // Terminal statuses are: "completed", "partially_captured", "canceled"
        const capturableStatuses = ["authorized", "awaiting", "not_paid"];
        paymentCollection = order.payment_collections?.find(pc =>
            pc ? capturableStatuses.includes(pc.status as string) : false
        );

        if (!paymentCollection) {
            const hasPaymentCollections = order.payment_collections && order.payment_collections.length > 0;
            if (hasPaymentCollections && order.payment_collections) {
                const statuses = order.payment_collections
                    .filter((pc): pc is NonNullable<typeof pc> => pc !== null)
                    .map(pc => pc.status)
                    .join(', ');
                console.log(
                    `[PAY-01] Order ${orderId}: No capturable PaymentCollection found. ` +
                    `Current statuses: ${statuses}. May already be captured or in terminal state.`
                );

                // Return the first one anyway for transaction recording, even if already captured
                const existingPC = order.payment_collections[0];
                if (!existingPC) {
                    return { paymentCollectionId: null, paymentId: null };
                }
                const paymentId = existingPC.payments?.[0]?.id as string | undefined;
                return {
                    paymentCollectionId: existingPC.id as string,
                    paymentId: paymentId ?? null
                };
            } else {
                // NO BACKWARD COMPATIBILITY - fail loudly if no PaymentCollection
                console.error(
                    `[PAY-01][CRITICAL] Order ${orderId}: No PaymentCollection found! ` +
                    `This order was created before PAY-01 deployment and is not supported. ` +
                    `Pre-PAY-01 orders must be handled manually via admin UI.`
                );
                return { paymentCollectionId: null, paymentId: null };
            }
        }

        // PAY-01: Validate and type-check PaymentCollection status
        let currentStatus: PaymentCollectionStatusType;
        try {
            currentStatus = validatePaymentCollectionStatus(
                paymentCollection.status,
                orderId
            );
        } catch (error) {
            console.error(`[PAY-01][ERROR] Invalid PaymentCollection status for order ${orderId}:`, error);
            // Don't throw - log error and continue (payment was captured via Stripe)
            return { paymentCollectionId: null, paymentId: null };
        }

        // Double-check if already in terminal state (shouldn't happen after find() above, but defensive)
        if (isTerminalStatus(currentStatus)) {
            console.log(`[PAY-01] Order ${orderId}: PaymentCollection already in final state: ${currentStatus}`);
            const paymentId = paymentCollection.payments?.[0]?.id as string | undefined;
            return { paymentCollectionId: paymentCollection.id as string, paymentId: paymentId ?? null };
        }

        // Update PaymentCollection status via Payment Module
        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using 'as any' is the standard pattern for resolving module services in Medusa v2
        // The service provides methods like updatePaymentCollections() and capturePayment()
        const paymentModuleService = containerRef.resolve(Modules.PAYMENT) as any;
        
        await paymentModuleService.updatePaymentCollections([
            {
                id: paymentCollection.id,
                status: PaymentCollectionStatus.COMPLETED,
            },
        ]);

        console.log(
            `[PAY-01] Order ${orderId}: PaymentCollection ${paymentCollection.id} status updated to "completed" ` +
            `(amount: ${amountCaptured} cents)`
        );

        const paymentId = paymentCollection.payments?.[0]?.id as string | undefined;
        return { paymentCollectionId: paymentCollection.id as string, paymentId: paymentId ?? null };

    } catch (error) {
        // REVIEW FIX (Issue #13): Zombie PaymentCollection detection and alerting
        // CRITICAL: Payment was captured in Stripe, but PC status update failed
        // This creates a data inconsistency that requires manual intervention
        console.error(`[PAY-01][ERROR] Failed to update PaymentCollection for order ${orderId}:`, error);

        // Emit CRITICAL alert for zombie PaymentCollection
        // Operators should investigate and manually update PaymentCollection status
        console.error(
            `[CRITICAL][ZOMBIE] Zombie PaymentCollection detected! ` +
            `order=${orderId} payment_collection=${paymentCollection?.id || 'unknown'} ` +
            `amount=${amountCaptured} ` +
            `error=${(error as Error).name} message="${(error as Error).message}"`
        );

        // Emit metric for monitoring and alerting
        console.log(
            `[METRIC] zombie_payment_collection ` +
            `order=${orderId} payment_collection=${paymentCollection?.id || 'unknown'} ` +
            `amount=${amountCaptured}`
        );

        // Log but don't throw - payment was captured via Stripe, PC update is secondary
        // However, this is a CRITICAL issue that needs operator attention
        return { paymentCollectionId: null, paymentId: null };
    }
}

/**
 * PAY-01: Create OrderTransaction record on capture
 *
 * AC4: Capture creates an OrderTransaction record of type "capture"
 * This enables downstream features like RET-01 (Returns/Refunds) which need
 * to query OrderTransactions to calculate refundable amounts.
 *
 * CURRENCY UNITS:
 * - Input: amountCaptured is in CENTS (minor units) from Stripe API
 * - Output: Medusa v2 OrderTransaction.amount uses MAJOR UNITS (dollars)
 * - Conversion: Divide by 100 for most currencies (USD, EUR)
 * - Exception: Zero-decimal currencies (JPY, KRW) don't need division
 *
 * @param orderId - The Medusa order ID
 * @param amountCaptured - Amount captured in cents (Stripe minor units)
 * @param currencyCode - The currency code (e.g., "usd", "jpy")
 * @param paymentCollectionId - The PaymentCollection ID (used as reference)
 * @param paymentId - The Payment ID (preferred reference)
 */
async function createOrderTransactionOnCapture(
    orderId: string,
    amountCaptured: number,
    currencyCode: string,
    paymentCollectionId: string | null,
    paymentId: string | null
): Promise<void> {
    if (!containerRef) {
        return;
    }

    try {
        const orderModuleService = containerRef.resolve(Modules.ORDER) as any;

        // Medusa v2 uses MAJOR UNITS for all amount fields (confirmed via official docs)
        // Convert Stripe minor units (cents) → Medusa major units (dollars)
        // TODO: Handle zero-decimal currencies (JPY, KRW) - they don't need division
        const amountInMajorUnits = amountCaptured / 100;

        // Create OrderTransaction with reference to the capture
        await orderModuleService.addOrderTransactions({
            order_id: orderId,
            amount: amountInMajorUnits, // Major units (e.g., 45.5 for $45.50)
            currency_code: currencyCode,
            reference: "capture",
            reference_id: paymentId || paymentCollectionId || `stripe_capture_${orderId}`,
        });

        console.log(
            `[PAY-01] Order ${orderId}: Created OrderTransaction for capture ` +
            `(amount: ${amountInMajorUnits} ${currencyCode.toUpperCase()}, reference_id: ${paymentId || paymentCollectionId || `stripe_capture_${orderId}`})`
        );

    } catch (error) {
        // Log but don't throw - OrderTransaction is for downstream features, not critical
        console.error(`[PAY-01][ERROR] Failed to create OrderTransaction for order ${orderId}:`, error);
    }
}

/**
 * PAY-01: Capture payment using Medusa Payment Module (AC3)
 *
 * CURRENCY UNITS:
 * - Input: amountCents is in CENTS (minor units) from Stripe context
 * - Payment Module API expects MAJOR UNITS (dollars)
 * - Conversion: Divide by 100 for most currencies (USD, EUR)
 * - Medusa's Stripe provider will convert back to cents when calling Stripe API
 *
 * @param paymentId - The Payment ID from PaymentCollection
 * @param amountCents - Amount in cents (Stripe minor units)
 * @param currencyCode - Currency code (e.g., "usd", "jpy")
 */
async function capturePaymentViaPaymentModule(paymentId: string | null, amountCents: number, currencyCode: string): Promise<void> {
    if (!containerRef || !paymentId) {
        console.warn("[PAY-01] No paymentId available for Payment Module capture; skipping PaymentModule capture.");
        return;
    }

    try {
        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using 'as any' is the standard pattern for resolving module services in Medusa v2
        const paymentModuleService = containerRef.resolve(Modules.PAYMENT) as any;

        // Medusa v2 Payment Module uses MAJOR UNITS (confirmed via official docs)
        // Convert Stripe cents → Medusa major units
        // TODO: Handle zero-decimal currencies (JPY, KRW) - they don't need division
        const amountInMajorUnits = amountCents / 100;

        await paymentModuleService.capturePayment({
            payment_id: paymentId,
            amount: amountInMajorUnits, // Major units (e.g., 45.5 for $45.50)
        });

        console.log(
            `[PAY-01] Captured payment via Payment Module: ` +
            `paymentId=${paymentId}, amount=${amountInMajorUnits} ${currencyCode.toUpperCase()}`
        );
    } catch (error) {
        console.error(`[PAY-01][ERROR] Payment Module capture failed for payment ${paymentId}:`, error);
        throw error;
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

        // Step 3: Try Payment Module capture first (AC3)
        const { paymentId } = await getPaymentInfoForOrder(orderId);
        let capturedViaPaymentModule = false;

        if (paymentId) {
            try {
                await capturePaymentViaPaymentModule(paymentId, totalCents, currencyCode);
                capturedViaPaymentModule = true;

                // REVIEW FIX (Issue #12): Emit success metric for Payment Module capture
                console.log(
                    `[METRIC] payment_module_capture_success ` +
                    `order=${orderId} payment=${paymentId} amount=${totalCents}`
                );
            } catch (pmError) {
                // REVIEW FIX (Issue #12): Enhanced fallback logging with error classification
                const errorName = (pmError as Error).name || 'UnknownError';
                const errorCode = (pmError as any).code || 'UNKNOWN';
                const errorMessage = (pmError as Error).message || 'No message';

                console.error(
                    `[PaymentCapture][WARN] Payment Module capture failed for order ${orderId}, falling back to Stripe:`,
                    pmError
                );

                // Emit metric for monitoring - track fallback frequency and error types
                console.log(
                    `[METRIC] payment_module_capture_fallback ` +
                    `order=${orderId} payment=${paymentId} error_name=${errorName} error_code=${errorCode} ` +
                    `message="${errorMessage.substring(0, 100)}"`
                );
            }
        } else {
            console.warn(`[PAY-01] No paymentId on order ${orderId}; falling back to Stripe capture.`);

            // REVIEW FIX (Issue #12): Track cases where Payment Module path isn't available
            console.log(
                `[METRIC] payment_module_capture_unavailable ` +
                `order=${orderId} reason=no_payment_id`
            );
        }

        if (!capturedViaPaymentModule) {
            // Step 4: Handle different capture scenarios via Stripe fallback
            if (totalCents > authorizedAmount) {
                // EXCESS: Order total increased beyond authorized amount
                // This should not happen normally - would require increment_authorization
                console.error(
                    `[PaymentCapture][CRITICAL] Order ${orderId}: Total (${totalCents}) exceeds authorized amount (${authorizedAmount}). ` +
                    `Manual intervention required!`
                );
                throw new Error(`Amount to capture (${totalCents}) exceeds authorized amount (${authorizedAmount})`);
            }

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
        } else {
            console.log(`[PAY-01] Order ${orderId}: Captured ${totalCents} cents via Payment Module`);
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

    worker.on("failed", async (job, err) => {
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

            // Send admin notification for payment capture failure
            if (containerRef) {
                try {
                    await sendAdminNotification(containerRef, {
                        type: AdminNotificationType.PAYMENT_FAILED,
                        title: "Payment Capture Failed",
                        description: `Payment capture failed for order ${job?.data?.orderId} after ${attemptsMade} attempts. Manual intervention required.`,
                        metadata: {
                            order_id: job?.data?.orderId,
                            payment_intent_id: job?.data?.paymentIntentId,
                            attempts: attemptsMade,
                            error: err?.message,
                        },
                    });
                } catch (notifError) {
                    console.error("[PaymentCapture] Failed to send admin notification:", notifError);
                }
            }
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
