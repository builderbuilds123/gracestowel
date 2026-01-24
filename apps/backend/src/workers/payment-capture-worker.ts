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

import { Worker, Job } from "bullmq";
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
import { logger } from "../utils/logger";

// Avoid accumulating process signal listeners during Jest runs.
const IS_JEST = process.env.JEST_WORKER_ID !== undefined;

let worker: Worker<PaymentCaptureJobData> | null = null;
let shutdownHandler: (() => Promise<void>) | null = null;
let containerRef: MedusaContainer | null = null;

// NOTE: Removed promoterQueue and promoterInterval - BullMQ Worker handles delayed job promotion automatically
// Manual promotion was causing jobs to execute ~295 seconds too early

async function getOrderMetadata(orderId: string): Promise<Record<string, unknown>> {
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

        const metadata = (orders?.[0]?.metadata || {}) as Record<string, unknown>;
        if (metadata && typeof metadata === "object") {
            return metadata;
        }
        return {};
    } catch (error) {
        logger.error("payment-capture-worker", "Failed to get order metadata", {
            orderId,
        }, error instanceof Error ? error : new Error(String(error)));
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

// NOTE: Removed promoteDueCaptureJobs() function
// BullMQ Worker automatically promotes delayed jobs when their delay expires
// Manual promotion was causing premature job execution

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
        const metadata = order.metadata as Record<string, unknown> | undefined;
        let total: number | undefined;

        logger.debug("payment-capture-worker", "Parsing total for order", { orderId });

        // Story 3.2: Check metadata.updated_total first for orders modified during grace period
        const rawUpdatedTotal = metadata?.updated_total as unknown;
        if (rawUpdatedTotal !== undefined && rawUpdatedTotal !== null) {
            const parsed = typeof rawUpdatedTotal === "number" 
                ? rawUpdatedTotal 
                : parseFloat(String(rawUpdatedTotal));
            
            if (Number.isFinite(parsed)) {
                total = parsed;
                logger.debug("payment-capture-worker", "Using metadata.updated_total", {
                    orderId,
                    total,
                    original: String(rawUpdatedTotal),
                });
            } else {
                logger.debug("payment-capture-worker", "metadata.updated_total found but invalid", {
                    orderId,
                    original: String(rawUpdatedTotal),
                });
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
                logger.debug("payment-capture-worker", "Using summary.current_order_total", {
                    orderId,
                    total,
                    original: String(summaryTotal),
                });
            } else {
                logger.debug("payment-capture-worker", "summary.current_order_total found but invalid", {
                    orderId,
                    original: String(summaryTotal),
                });
            }
        }

        // Fallback to order.total
        if (total === undefined) {
            interface OrderWithTotal {
                total?: number | { numeric_?: number } | string | unknown;
            }
            const rawTotal = (order as OrderWithTotal).total;
            const parsed = typeof rawTotal === "number" 
                ? rawTotal 
                : typeof rawTotal === "object" && rawTotal !== null && "numeric_" in rawTotal
                    ? (rawTotal as { numeric_?: number }).numeric_
                    : parseFloat(String(rawTotal));
                
            if (Number.isFinite(parsed)) {
                total = parsed;
                logger.debug("payment-capture-worker", "Using order.total", {
                    orderId,
                    total,
                    original: String(rawTotal),
                });
            } else {
                logger.debug("payment-capture-worker", "order.total found but invalid", {
                    orderId,
                    original: String(rawTotal),
                });
            }
        }

        if (total === undefined || !Number.isFinite(total)) {
            interface OrderWithTotal {
                total?: unknown;
            }
            const rawTotalForLog = (order as OrderWithTotal).total;
            const debugInfo = {
                rawTotalType: typeof rawTotalForLog,
                rawTotalString: String(rawTotalForLog),
                summaryExists: !!order.summary,
                updatedTotalExists: rawUpdatedTotal !== undefined
            };
            logger.error("payment-capture-worker", "Order has invalid total calculation", {
                orderId,
                ...debugInfo,
            });
            throw new Error(`Order ${orderId} has invalid total: ${JSON.stringify(rawTotalForLog)} (Debug: ${JSON.stringify(debugInfo)})`);
        }

        // Story 2.3 AC2: Medusa v2 BigNumber totals are unit amounts (e.g., 147.00 USD).
        // We MUST multiply by 100 to get cents for capture.
        // We no longer guess based on Number.isInteger because "147" (integer) is $147.00, not 147 cents.
        const totalCents = Math.round(total * 100);

        // M1: Fail if currency is missing instead of falling back to USD
        if (!order.currency_code) {
            logger.error("payment-capture-worker", "Order has no currency code", { orderId });
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
        logger.error("payment-capture-worker", "Failed to retrieve payment info for order", {
            orderId,
        }, error instanceof Error ? error : new Error(String(error)));
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
        logger.error("payment-capture-worker", "Container not initialized - cannot set edit status", {});
        return false;
    }

    try {
        const currentMetadata = await getOrderMetadata(orderId);

        // Optimistic locking: check current state if expected status specified
        if (expectCurrentStatus !== undefined) {
            const currentStatus = currentMetadata?.edit_status as string | undefined;
            if (currentStatus === "locked_for_capture") {
                logger.warn("payment-capture-worker", "Order already locked - skipping lock acquisition", {
                    orderId,
                    currentStatus,
                });
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
        logger.info("payment-capture-worker", "Order edit_status set", {
            orderId,
            editStatus,
        });
        return true;
    } catch (error) {
        logger.error("payment-capture-worker", "Error setting edit_status for order", {
            orderId,
            editStatus,
        }, error instanceof Error ? error : new Error(String(error)));
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
        logger.error("payment-capture-worker", "Container not initialized - cannot update order", {});
        throw new Error("Container not initialized - critical payment infrastructure unavailable");
    }

    let currencyCode = "usd"; // Default fallback

    try {
        const currentStatus = await getOrderStatus(orderId);

        if (currentStatus === "canceled") {
            logger.warn("payment-capture-worker", "Order is canceled in Medusa - not updating status after capture", {
                orderId,
            });
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
            logger.info("payment-capture-worker", "Order status updated to completed", {
                orderId,
            });
        }

    } catch (error) {
        logger.error("payment-capture-worker", "Error updating order after capture", {
            orderId,
            amountCaptured,
        }, error instanceof Error ? error : new Error(String(error)));
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
        logger.critical("payment-capture-worker", "Container not initialized - cannot update PaymentCollection", {
            orderId,
            message: "Payment was captured in Stripe but PaymentCollection status will not be updated",
        });
        logger.info("payment-capture-worker", "Payment collection update blocked", {
            orderId,
            reason: "no_container",
        });
        return { paymentCollectionId: null, paymentId: null };
    }

    // Declare paymentCollection outside try block for catch block access
    interface PaymentCollection {
        id?: string;
        status?: string;
        payments?: Array<{ id?: string }>;
    }
    let paymentCollection: PaymentCollection | null = null;

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
            logger.warn("payment-capture-worker", "Order not found for PaymentCollection update", {
                orderId,
            });
            return { paymentCollectionId: null, paymentId: null };
        }

        // REVIEW FIX: Find the capturable PaymentCollection instead of blindly using the first one
        // Capturable statuses are those that can transition to "completed": "authorized", "awaiting", etc.
        // Terminal statuses are: "completed", "partially_captured", "canceled"
        const capturableStatuses = ["authorized", "awaiting", "not_paid"];
        const foundCollection = order.payment_collections?.find(pc => {
            if (!pc || pc === null) return false;
            const status = (pc as { status?: string }).status;
            return status && capturableStatuses.includes(status);
        });
        paymentCollection = (foundCollection as PaymentCollection | null) || null;

        if (!paymentCollection) {
            const hasPaymentCollections = order.payment_collections && order.payment_collections.length > 0;
            if (hasPaymentCollections && order.payment_collections) {
                const statuses = order.payment_collections
                    .filter((pc): pc is NonNullable<typeof pc> => pc !== null)
                    .map(pc => pc.status)
                    .join(', ');
                logger.info("payment-capture-worker", "No capturable PaymentCollection found", {
                    orderId,
                    currentStatuses: statuses,
                    message: "May already be captured or in terminal state",
                });

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
                logger.critical("payment-capture-worker", "No PaymentCollection found", {
                    orderId,
                    message: "This order was created before PAY-01 deployment and is not supported. Pre-PAY-01 orders must be handled manually via admin UI.",
                });
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
            logger.error("payment-capture-worker", "Invalid PaymentCollection status for order", {
                orderId,
            }, error instanceof Error ? error : new Error(String(error)));
            // Don't throw - log error and continue (payment was captured via Stripe)
            return { paymentCollectionId: null, paymentId: null };
        }

        // Double-check if already in terminal state (shouldn't happen after find() above, but defensive)
        if (isTerminalStatus(currentStatus)) {
            logger.info("payment-capture-worker", "PaymentCollection already in final state", {
                orderId,
                currentStatus,
            });
            const paymentId = paymentCollection.payments?.[0]?.id as string | undefined;
            return { paymentCollectionId: paymentCollection.id as string, paymentId: paymentId ?? null };
        }

        // Update PaymentCollection status via Payment Module
        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using type assertion is the standard pattern for resolving module services in Medusa v2
        // The service provides methods like updatePaymentCollections() and capturePayment()
        interface PaymentModuleService {
            updatePaymentCollections: (updates: Array<{ id: string; status: string }>) => Promise<void>;
        }
        const paymentModuleService = containerRef.resolve(Modules.PAYMENT) as unknown as PaymentModuleService;
        
        await paymentModuleService.updatePaymentCollections([
            {
                id: paymentCollection.id as string,
                status: PaymentCollectionStatus.COMPLETED,
            },
        ]);

        logger.info("payment-capture-worker", "PaymentCollection status updated to completed", {
            orderId,
            paymentCollectionId: paymentCollection.id,
            amountCaptured,
        });

        const paymentId = paymentCollection.payments?.[0]?.id as string | undefined;
        return { paymentCollectionId: paymentCollection.id as string, paymentId: paymentId ?? null };

    } catch (error) {
        // REVIEW FIX (Issue #13): Zombie PaymentCollection detection and alerting
        // CRITICAL: Payment was captured in Stripe, but PC status update failed
        // This creates a data inconsistency that requires manual intervention
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logger.error("payment-capture-worker", "Failed to update PaymentCollection for order", {
            orderId,
            paymentCollectionId: paymentCollection?.id || 'unknown',
            amountCaptured,
        }, errorObj);

        // Emit CRITICAL alert for zombie PaymentCollection
        // Operators should investigate and manually update PaymentCollection status
        logger.critical("payment-capture-worker", "Zombie PaymentCollection detected", {
            orderId,
            paymentCollectionId: paymentCollection?.id || 'unknown',
            amountCaptured,
            errorName: errorObj.name,
            errorMessage: errorObj.message,
        });

        // Emit metric for monitoring and alerting
        logger.info("payment-capture-worker", "Zombie payment collection metric", {
            orderId,
            paymentCollectionId: paymentCollection?.id || 'unknown',
            amountCaptured,
        });

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
        const referenceId = paymentId || paymentCollectionId || `stripe_capture_${orderId}`;
        await orderModuleService.addOrderTransactions({
            order_id: orderId,
            amount: amountInMajorUnits, // Major units (e.g., 45.5 for $45.50)
            currency_code: currencyCode,
            reference: "capture",
            reference_id: referenceId,
        });

        logger.info("payment-capture-worker", "Created OrderTransaction for capture", {
            orderId,
            amount: amountInMajorUnits,
            currencyCode: currencyCode.toUpperCase(),
            referenceId,
        });

    } catch (error) {
        // Log but don't throw - OrderTransaction is for downstream features, not critical
        logger.error("payment-capture-worker", "Failed to create OrderTransaction for order", {
            orderId,
        }, error instanceof Error ? error : new Error(String(error)));
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
        logger.warn("payment-capture-worker", "No paymentId available for Payment Module capture - skipping", {});
        return;
    }

    try {
        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using type assertion is the standard pattern for resolving module services in Medusa v2
        interface PaymentModuleService {
            capturePayment: (params: { payment_id: string; amount: number }) => Promise<void>;
        }
        const paymentModuleService = containerRef.resolve(Modules.PAYMENT) as unknown as PaymentModuleService;

        // Medusa v2 Payment Module uses MAJOR UNITS (confirmed via official docs)
        // Convert Stripe cents → Medusa major units
        // TODO: Handle zero-decimal currencies (JPY, KRW) - they don't need division
        const amountInMajorUnits = amountCents / 100;

        await paymentModuleService.capturePayment({
            payment_id: paymentId,
            amount: amountInMajorUnits, // Major units (e.g., 45.5 for $45.50)
        });

        logger.info("payment-capture-worker", "Captured payment via Payment Module", {
            paymentId,
            amount: amountInMajorUnits,
            currencyCode: currencyCode.toUpperCase(),
        });
    } catch (error) {
        logger.error("payment-capture-worker", "Payment Module capture failed", {
            paymentId,
        }, error instanceof Error ? error : new Error(String(error)));
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
    const { orderId, paymentIntentId, scheduledAt, source } = job.data as PaymentCaptureJobData & { source?: string };

    // DEBUG: Log detailed job information
    const now = Date.now();
    const scheduledDelay = now - scheduledAt;
    logger.debug("payment-capture-worker", "Capture job processing", {
        orderId,
        paymentIntentId,
        jobId: job.id,
        jobName: job.name,
        source: source || "normal",
        scheduledAt: new Date(scheduledAt).toISOString(),
        processingAt: new Date(now).toISOString(),
        actualDelayMs: scheduledDelay,
        actualDelaySeconds: Math.round(scheduledDelay / 1000),
        actualDelayMinutes: Math.round(scheduledDelay / 60000),
        jobDelayOption: job.opts?.delay,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts || 3,
    });

    logger.info("payment-capture-worker", "Processing capture for order", { orderId });

    if (!orderId || typeof orderId !== "string" || !orderId.startsWith("order_")) {
        logger.critical("payment-capture-worker", "Invalid orderId in job", {
            jobId: job.id,
            orderId,
        });
        return;
    }

    if (!paymentIntentId || typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) {
        logger.critical("payment-capture-worker", "Invalid paymentIntentId for order", {
            orderId,
            jobId: job.id,
            paymentIntentId,
        });
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
            logger.info("payment-capture-worker", "Payment was already canceled", {
                orderId,
                paymentIntentId,
            });
            return;
        }
        
        if (paymentIntent.status === "succeeded") {
            logger.info("payment-capture-worker", "Payment was already captured", {
                orderId,
                paymentIntentId,
            });
            const alreadyCapturedAmount =
                typeof paymentIntent.amount_received === "number" && paymentIntent.amount_received > 0
                    ? paymentIntent.amount_received
                    : paymentIntent.amount;
            await updateOrderAfterCapture(orderId, alreadyCapturedAmount);
            return;
        }
        
        if (paymentIntent.status !== "requires_capture") {
            logger.info("payment-capture-worker", "Unexpected payment intent status", {
                orderId,
                paymentIntentId,
                status: paymentIntent.status,
            });
            return;
        }

        // Step 2: Fetch fresh order total from Medusa (Story 2.3)
        const orderData = await fetchOrderTotal(orderId);
        
        if (!orderData) {
            // Do NOT capture if order data is unavailable; fail for manual review to avoid charging canceled/missing orders
            logger.critical("payment-capture-worker", "Could not fetch order details - aborting capture", {
                orderId,
            });
            throw new Error(`Could not fetch order details for order ${orderId}`);
        }

        // Guard: Skip capture if order is canceled in Medusa
        if (orderData.status === "canceled") {
            logger.critical("payment-capture-worker", "Order is canceled in Medusa but PI still requires capture - skipping", {
                orderId,
                paymentIntentId,
            });
            logger.info("payment-capture-worker", "Capture blocked for canceled order", {
                orderId,
            });
            return;
        }

        const { totalCents, currencyCode } = orderData;
        const authorizedAmount = paymentIntent.amount;

        // M2: Validate currency match
        if (currencyCode.toLowerCase() !== paymentIntent.currency.toLowerCase()) {
            logger.critical("payment-capture-worker", "Currency mismatch - cannot capture", {
                orderId,
                orderCurrency: currencyCode,
                paymentIntentCurrency: paymentIntent.currency,
            });
            throw new Error(`Currency mismatch: Order ${currencyCode} vs PaymentIntent ${paymentIntent.currency}`);
        }

        logger.info("payment-capture-worker", "Payment capture amounts", {
            orderId,
            authorizedAmount,
            orderTotal: totalCents,
        });

        // Step 3: Try Payment Module capture first (AC3)
        const { paymentId } = await getPaymentInfoForOrder(orderId);
        let capturedViaPaymentModule = false;

        if (paymentId) {
            try {
                await capturePaymentViaPaymentModule(paymentId, totalCents, currencyCode);
                capturedViaPaymentModule = true;

                // REVIEW FIX (Issue #12): Emit success metric for Payment Module capture
                logger.info("payment-capture-worker", "Payment module capture success", {
                    orderId,
                    paymentId,
                    amount: totalCents,
                });
            } catch (pmError) {
                // REVIEW FIX (Issue #12): Enhanced fallback logging with error classification
                const errorObj = pmError instanceof Error ? pmError : new Error(String(pmError));
                interface ErrorWithCode extends Error {
                    code?: string;
                }
                const errorWithCode = errorObj as ErrorWithCode;
                const errorCode = errorWithCode.code || 'UNKNOWN';

                logger.warn("payment-capture-worker", "Payment Module capture failed - falling back to Stripe", {
                    orderId,
                    paymentId,
                    errorName: errorObj.name,
                    errorCode,
                    errorMessage: errorObj.message.substring(0, 100),
                });

                // Emit metric for monitoring - track fallback frequency and error types
                logger.info("payment-capture-worker", "Payment module capture fallback metric", {
                    orderId,
                    paymentId,
                    errorName: errorObj.name,
                    errorCode,
                });
            }
        } else {
            logger.warn("payment-capture-worker", "No paymentId on order - falling back to Stripe capture", {
                orderId,
            });

            // REVIEW FIX (Issue #12): Track cases where Payment Module path isn't available
            logger.info("payment-capture-worker", "Payment module capture unavailable", {
                orderId,
                reason: "no_payment_id",
            });
        }

        if (!capturedViaPaymentModule) {
            // Step 4: Handle different capture scenarios via Stripe fallback
            if (totalCents > authorizedAmount) {
                // EXCESS: Order total increased beyond authorized amount
                // This should not happen normally - would require increment_authorization
                logger.critical("payment-capture-worker", "Order total exceeds authorized amount - manual intervention required", {
                    orderId,
                    totalCents,
                    authorizedAmount,
                });
                throw new Error(`Amount to capture (${totalCents}) exceeds authorized amount (${authorizedAmount})`);
            }

            // Story 1.2: Fix idempotency key - use orderId + paymentIntentId (not timestamp)
            // This ensures identical keys across all capture paths (scheduled, fulfillment, fallback)
            const captured = await stripe.paymentIntents.capture(
                paymentIntentId,
                {
                    amount_to_capture: totalCents,
                },
                {
                    idempotencyKey: `capture_${orderId}_${paymentIntentId}`,
                }
            );

            if (totalCents < authorizedAmount) {
                // PARTIAL: Order total decreased (items removed during grace period)
                // Stripe automatically releases the uncaptured portion
                const released = authorizedAmount - totalCents;
                logger.info("payment-capture-worker", "Partial capture - released uncaptured portion", {
                    orderId,
                    capturedAmount: totalCents,
                    releasedAmount: released,
                    status: captured.status,
                });
            } else {
                logger.info("payment-capture-worker", "Payment captured via Stripe", {
                    orderId,
                    amount: totalCents,
                    status: captured.status,
                });
            }
        } else {
            logger.info("payment-capture-worker", "Payment captured via Payment Module", {
                orderId,
                amount: totalCents,
            });
        }

        // Step 5: Update Medusa order with capture metadata and release lock
        await updateOrderAfterCapture(orderId, totalCents);
        
        // Story 6.3: Release lock after successful capture
        await setOrderEditStatus(orderId, "idle");
        lockAcquired = false; // Mark as released so finally doesn't double-release

    } catch (error: unknown) {
        // Handle specific Stripe errors using property checks (more robust than instanceof)
        interface StripeError extends Error {
            type?: string;
            code?: string;
        }
        const stripeError = error as StripeError;
        if (stripeError?.type === "invalid_request_error" && stripeError?.code === "amount_too_large") {
            logger.critical("payment-capture-worker", "Amount too large error - manual intervention required", {
                orderId,
                message: "The order total exceeds authorized amount",
            }, error instanceof Error ? error : new Error(String(error)));
        } else {
            logger.error("payment-capture-worker", "Error capturing payment for order", {
                orderId,
            }, error instanceof Error ? error : new Error(String(error)));
        }
        
        throw error; // Re-throw to trigger retry
    } finally {
        // Story 6.3 AC 8: Always release lock in finally block to prevent stuck locks
        if (lockAcquired) {
            try {
                await setOrderEditStatus(orderId, "idle");
            } catch (releaseError) {
                logger.critical("payment-capture-worker", "Failed to release lock for order", {
                    orderId,
                }, releaseError instanceof Error ? releaseError : new Error(String(releaseError)));
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

    // NOTE: Removed manual promoteJobs() calls - BullMQ Worker automatically promotes delayed jobs
    // Manual promotion every 5 seconds was causing jobs to execute ~295 seconds too early
    // BullMQ's Worker has built-in logic to promote delayed jobs at the correct time
    // See: https://docs.bullmq.io/guide/jobs/delayed
    // If manual promotion is needed in the future, it should only run every 60 seconds
    // and should check job timestamps before promoting to avoid premature execution

    worker.on("completed", (job) => {
        logger.info("payment-capture-worker", "Job completed", {
            jobId: job.id,
            orderId: job.data?.orderId,
        });
    });

    worker.on("failed", async (job, err) => {
        const attemptsMade = job?.attemptsMade || 0;
        const maxAttempts = job?.opts?.attempts || 3;
        const orderId = job?.data?.orderId;
        const paymentIntentId = job?.data?.paymentIntentId;

        if (attemptsMade >= maxAttempts) {
            // CRITICAL: Job has exhausted all retries - revenue at risk
            logger.critical("payment-capture-worker", "Payment capture permanently failed - manual intervention required", {
                orderId,
                paymentIntentId,
                attemptsMade,
                maxAttempts,
            }, err instanceof Error ? err : new Error(String(err)));

            // Send admin notification for payment capture failure
            if (containerRef) {
                try {
                    await sendAdminNotification(containerRef, {
                        type: AdminNotificationType.PAYMENT_FAILED,
                        title: "Payment Capture Failed",
                        description: `Payment capture failed for order ${orderId} after ${attemptsMade} attempts. Manual intervention required.`,
                        metadata: {
                            order_id: orderId,
                            payment_intent_id: paymentIntentId,
                            attempts: attemptsMade,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                } catch (notifError) {
                    logger.error("payment-capture-worker", "Failed to send admin notification", {}, notifError instanceof Error ? notifError : new Error(String(notifError)));
                }
            }
        } else {
            logger.error("payment-capture-worker", "Job failed", {
                jobId: job?.id,
                orderId,
                attemptsMade,
                maxAttempts,
            }, err instanceof Error ? err : new Error(String(err)));
        }
    });

    logger.info("payment-capture-worker", "Worker started", {});

    // Graceful shutdown (register once). Skip in Jest to avoid listener accumulation.
    if (!shutdownHandler && !IS_JEST) {
        shutdownHandler = async () => {
            logger.info("payment-capture-worker", "Shutting down worker");
            await worker?.close();
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
