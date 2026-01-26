/**
 * Payment Capture Core Logic
 * 
 * Shared logic for capturing payments, used by both:
 * 1. BullMQ Worker (Legacy/Async)
 * 2. Native Workflow (Fulfillment triggering)
 * 
 * Extracted from payment-capture-worker.ts to ensure consistent behavior.
 */

import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { getStripeClient } from "../utils/stripe";
import { logger } from "../utils/logger";
import {
    PaymentCollectionStatus,
    validatePaymentCollectionStatus,
    isTerminalStatus,
    type PaymentCollectionStatusType,
} from "../types/payment-collection-status";
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications";

/**
 * Fetch order metadata for locking checks
 */
export async function getOrderMetadata(container: MedusaContainer, orderId: string): Promise<Record<string, unknown>> {
    try {
        const query = container.resolve("query");
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
        logger.error("payment-capture-core", "Failed to get order metadata", { orderId }, error);
        return {};
    }
}

/**
 * Set order edit_status for race condition handling (Optimistic Locking)
 */
export async function setOrderEditStatus(
    container: MedusaContainer,
    orderId: string,
    editStatus: "locked_for_capture" | "idle" | "editable",
    expectCurrentStatus?: "editable" | "idle" | undefined
): Promise<boolean> {
    try {
        const currentMetadata = await getOrderMetadata(container, orderId);

        // Optimistic locking: check current state if expected status specified
        if (expectCurrentStatus !== undefined) {
            const currentStatus = currentMetadata?.edit_status as string | undefined;
            if (currentStatus === "locked_for_capture") {
                logger.warn("payment-capture-core", "Order already locked - skipping lock acquisition", {
                    orderId,
                    currentStatus,
                });
                return false;
            }
        }

        const orderService = container.resolve("order");
        await orderService.updateOrders([{
            id: orderId,
            metadata: {
                ...currentMetadata,
                edit_status: editStatus,
                edit_status_updated_at: new Date().toISOString(),
            },
        }]);
        
        logger.info("payment-capture-core", "Order edit_status set", { orderId, editStatus });
        return true;
    } catch (error) {
        logger.error("payment-capture-core", "Error setting edit_status for order", {
            orderId,
            editStatus,
        }, error);
        throw error;
    }
}


/**
 * Fetch the current order data from Medusa
 * Story 2.3: Ensures we capture the ACTUAL order total, not the original PaymentIntent amount
 * Story 3.2: Now checks metadata.updated_total for orders modified during grace period
 */
export async function fetchOrderTotal(container: MedusaContainer, orderId: string): Promise<{ totalCents: number; currencyCode: string; status: string } | null> {
    try {
        const query = container.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "total", "summary", "currency_code", "status", "metadata"],
            filters: { id: orderId },
        });

        if (orders.length === 0) {
            throw new Error(`Order ${orderId} not found in DB via query.graph`);
        }

        const order = orders[0];
        
        // Story 3.2: Check metadata.updated_total first
        const metadata = order.metadata as Record<string, unknown> | undefined;
        let total: number | undefined;

        logger.debug("payment-capture-core", "Parsing total for order", { orderId });

        const rawUpdatedTotal = metadata?.updated_total as unknown;
        if (rawUpdatedTotal !== undefined && rawUpdatedTotal !== null) {
            const parsed = typeof rawUpdatedTotal === "number" 
                ? rawUpdatedTotal 
                : parseFloat(String(rawUpdatedTotal));
            
            if (Number.isFinite(parsed)) {
                total = parsed;
                logger.debug("payment-capture-core", "Using metadata.updated_total", {
                    orderId,
                    total,
                    original: String(rawUpdatedTotal),
                });
            }
        }

        // Fallback to order.summary if available
        if (total === undefined && order.summary?.current_order_total !== undefined && order.summary?.current_order_total !== null) {
            const summaryTotal = order.summary.current_order_total;
            const parsed = typeof summaryTotal === "number" 
                ? summaryTotal 
                : parseFloat(String(summaryTotal));
                
            if (Number.isFinite(parsed)) {
                total = parsed;
                logger.debug("payment-capture-core", "Using summary.current_order_total", {
                    orderId,
                    total,
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
                logger.debug("payment-capture-core", "Using order.total", {
                    orderId,
                    total,
                    original: String(rawTotal),
                });
            }
        }

        if (total === undefined || !Number.isFinite(total)) {
            logger.error("payment-capture-core", "Order has invalid total calculation", { orderId });
            throw new Error(`Order ${orderId} has invalid total`);
        }

        // Medusa v2 BigNumber totals are unit amounts (e.g., 147.00). Multiply by 100 for cents.
        const totalCents = Math.round(total * 100);

        if (!order.currency_code) {
            logger.error("payment-capture-core", "Order has no currency code", { orderId });
            return null;
        }

        return {
            totalCents: totalCents,
            currencyCode: order.currency_code,
            status: order.status || "unknown",
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Execute the payment capture process
 * 1. Validates order status
 * 2. Fetches total amount
 * 3. Captures via Stripe (if needed)
 * 4. Updates Medusa Order & PaymentCollection
 */
export async function executePaymentCapture(
    container: MedusaContainer,
    orderId: string,
    paymentIntentId: string,
    idempotencyKey?: string
): Promise<void> {
    void idempotencyKey;

    logger.info("payment-capture-core", "Executing payment capture", { orderId, paymentIntentId });

    // Resolve payment by PaymentIntent ID
    const query = container.resolve("query");
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "status",
            "payment_collections.id",
            "payment_collections.status",
            "payment_collections.payments.id",
            "payment_collections.payments.captured_at",
            "payment_collections.payments.data",
        ],
        filters: { id: orderId },
    });

    const order = orders?.[0];
    if (!order || !order.payment_collections?.length) {
        logger.warn("payment-capture-core", "No payment collections found for order", { orderId });
        return;
    }

    if (order.status === "canceled") {
        logger.warn("payment-capture-core", "Skipping capture: Order is canceled", { orderId });
        return;
    }

    const payment = order.payment_collections
        .flatMap((pc: any) => pc.payments || [])
        .find((p: any) => p?.data?.id === paymentIntentId);

    if (!payment?.id) {
        logger.warn("payment-capture-core", "No Payment found for PaymentIntent", {
            orderId,
            paymentIntentId,
        });
        return;
    }

    if (payment.captured_at) {
        logger.info("payment-capture-core", "Payment already captured in Medusa", {
            orderId,
            paymentId: payment.id,
        });
        return;
    }

    // Use native Medusa workflow for capture
    const { capturePaymentWorkflow } = await import("@medusajs/medusa/core-flows");
    await capturePaymentWorkflow(container).run({
        input: { payment_id: payment.id },
    });

    logger.info("payment-capture-core", "Payment captured via workflow", {
        orderId,
        paymentId: payment.id,
    });

    // Capture any authorized supplementary PaymentCollections (legacy path)
    await captureSupplementaryPaymentCollections(container, orderId);
}

// Helper: Update Order Logic (Migrated from worker)
export async function updateOrderAfterCapture(
    container: MedusaContainer,
    orderId: string,
    amountCaptured: number
): Promise<void> {
    let currencyCode = "usd";

    try {
        const query = container.resolve("query");
        
        // Get currency
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "currency_code", "status"],
            filters: { id: orderId },
        });
        
        if (orders?.[0]?.currency_code) {
            currencyCode = orders[0].currency_code;
        }
        
        const currentStatus = orders?.[0]?.status;

        // Update PaymentCollection
        const { paymentCollectionId, paymentId } = await updatePaymentCollectionOnCapture(container, orderId, amountCaptured);

        if (!paymentCollectionId) {
             throw new Error(`Order ${orderId} missing PaymentCollection`);
        }

        // Create Transaction
        await createOrderTransactionOnCapture(container, orderId, amountCaptured, currencyCode, paymentCollectionId, paymentId);

        // Update Order Status
        if (currentStatus !== "completed" && currentStatus !== "canceled") {
            const orderService = container.resolve("order");
            await orderService.updateOrders([{
                id: orderId,
                status: "completed"
            }]);
            logger.info("payment-capture-core", "Order status updated to completed", { orderId });
        }

    } catch (error) {
        logger.error("payment-capture-core", "Failed to update order after capture", { orderId }, error);
        throw error;
    }
}

// Helper: Update PaymentCollection
async function updatePaymentCollectionOnCapture(
    container: MedusaContainer,
    orderId: string,
    amountCaptured: number
): Promise<{ paymentCollectionId: string | null; paymentId: string | null }> {
    try {
        const query = container.resolve("query");
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
        if (!order || !order.payment_collections?.length) {
            return { paymentCollectionId: null, paymentId: null };
        }

        // Find capturable collection
        const capturableStatuses = ["authorized", "awaiting", "not_paid"];
        const collection = order.payment_collections.find((pc: any) =>
            capturableStatuses.includes(pc.status)
        ) || order.payment_collections[0];

        if (!collection) {
            logger.warn("payment-capture-core", "No PaymentCollection found for order", { orderId });
            return { paymentCollectionId: null, paymentId: null };
        }

        // Type assertion for Medusa Payment Module
        interface PaymentModuleService {
            updatePaymentCollections: (
                idOrSelector: string | Record<string, unknown>,
                data: { status: string }
            ) => Promise<void>;
        }
        const paymentModuleService = container.resolve(Modules.PAYMENT) as unknown as PaymentModuleService;

        await paymentModuleService.updatePaymentCollections(collection.id, {
            status: PaymentCollectionStatus.COMPLETED,
        });

        return {
            paymentCollectionId: collection.id,
            paymentId: collection.payments?.[0]?.id || null
        };

    } catch (error) {
        logger.error("payment-capture-core", "PaymentCollection update failed", { orderId }, error);
        return { paymentCollectionId: null, paymentId: null };
    }
}

// Helper: Create Order Transaction
async function createOrderTransactionOnCapture(
    container: MedusaContainer,
    orderId: string,
    amountCaptured: number,
    currencyCode: string,
    paymentCollectionId: string | null,
    paymentId: string | null
): Promise<void> {
    try {
        const orderModuleService = container.resolve(Modules.ORDER) as any;
        const amountInMajorUnits = amountCaptured / 100;

        await orderModuleService.addOrderTransactions({
            order_id: orderId,
            amount: amountInMajorUnits,
            currency_code: currencyCode,
            reference: "capture",
            reference_id: paymentId || paymentCollectionId || `stripe_capture_${orderId}`,
        });
    } catch (error) {
        logger.error("payment-capture-core", "OrderTransaction creation failed", { orderId }, error);
    }
}

/**
 * Result of capturing all order payments
 */
export interface CaptureAllPaymentsResult {
    /** Whether the order has any payments at all */
    hasPayments: boolean;
    /** Whether all payments were already captured (partial fulfillment scenario) */
    allAlreadyCaptured: boolean;
    /** Number of payments successfully captured in this call */
    capturedCount: number;
    /** Number of payments skipped (already captured) */
    skippedCount: number;
    /** Number of payments that failed to capture */
    failedCount: number;
    /** Error messages from failed captures */
    errors: string[];
}

/**
 * Capture ALL payments for an order (both original and supplementary)
 *
 * This is the main entry point for payment capture on fulfillment.
 * It captures all PaymentCollections linked to the order that are in capturable state.
 *
 * Features:
 * - Captures original PaymentCollection(s)
 * - Captures supplementary PaymentCollections (created during order modifications)
 * - Idempotent: skips already-captured payments with warning
 * - Returns detailed result for logging/monitoring
 *
 * @param container - Medusa container
 * @param orderId - The order ID
 * @param idempotencyKeyPrefix - Prefix for Stripe idempotency keys
 */
export async function captureAllOrderPayments(
    container: MedusaContainer,
    orderId: string,
    idempotencyKeyPrefix: string
): Promise<CaptureAllPaymentsResult> {
    const query = container.resolve("query");
    void idempotencyKeyPrefix;

    logger.info("payment-capture-core", "Capturing all payments for order", { orderId });

    // Fetch all PaymentCollections with their payments and Stripe data
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "currency_code",
            "status",
            "payment_collections.id",
            "payment_collections.status",
            "payment_collections.amount",
            "payment_collections.metadata",
            "payment_collections.payments.id",
            "payment_collections.payments.amount",
            "payment_collections.payments.captured_at",
            "payment_collections.payments.data",
        ],
        filters: { id: orderId },
    });

    const order = orders?.[0];
    if (!order || !order.payment_collections?.length) {
        logger.warn("payment-capture-core", "No payment collections found for order", { orderId });
        return {
            hasPayments: false,
            allAlreadyCaptured: false,
            capturedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            errors: [],
        };
    }

    // Guard: Do not capture if order is canceled
    if (order.status === "canceled") {
        logger.warn("payment-capture-core", "Skipping capture: Order is canceled", { orderId });
        return {
            hasPayments: true,
            allAlreadyCaptured: false,
            capturedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            errors: [],
        };
    }

    let capturedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Import capturePaymentWorkflow for supplementary payments
    const { capturePaymentWorkflow } = await import("@medusajs/medusa/core-flows");

    // Process each PaymentCollection
    for (const pcRaw of order.payment_collections) {
        const pc = pcRaw as {
            id: string;
            status: string;
            amount: number;
            metadata?: Record<string, unknown>;
            payments?: Array<{
                id: string;
                amount: number;
                captured_at?: string | Date | null;
                data?: { id?: string };
            }>;
        };

        const isSupplementary = pc.metadata?.supplementary_charge === true ||
                               pc.metadata?.supplementary_charge === "true";

        // Skip if already completed/captured
        if (pc.status === "completed" || pc.status === "captured") {
            logger.debug("payment-capture-core", "Skipping already completed PaymentCollection", {
                orderId,
                paymentCollectionId: pc.id,
                isSupplementary,
            });
            skippedCount++;
            continue;
        }

        // Skip if not in capturable state
        if (pc.status !== "authorized" && pc.status !== "awaiting") {
            logger.debug("payment-capture-core", "Skipping PaymentCollection in non-capturable state", {
                orderId,
                paymentCollectionId: pc.id,
                status: pc.status,
            });
            continue;
        }

        // Check if payment record exists and is already captured
        const payment = pc.payments?.[0];
        if (payment?.captured_at) {
            logger.debug("payment-capture-core", "Skipping already captured payment", {
                orderId,
                paymentCollectionId: pc.id,
                paymentId: payment.id,
            });
            skippedCount++;
            continue;
        }

        try {
            if (!payment) {
                logger.warn("payment-capture-core", "No Payment record found for PaymentCollection", {
                    orderId,
                    paymentCollectionId: pc.id,
                });
                failedCount++;
                continue;
            }

            if (isSupplementary) {
                logger.info("payment-capture-core", "Capturing supplementary payment", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId: payment.id,
                    amount: pc.amount,
                });
            } else {
                logger.info("payment-capture-core", "Capturing original payment", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId: payment.id,
                    amount: pc.amount,
                });
            }

            await capturePaymentWorkflow(container).run({
                input: { payment_id: payment.id },
            });

            capturedCount++;
            if (isSupplementary) {
                logger.info("payment-capture-core", "Supplementary payment captured", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId: payment.id,
                });
            } else {
                logger.info("payment-capture-core", "Original payment captured", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId: payment.id,
                });
            }

        } catch (error) {
            failedCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`PaymentCollection ${pc.id}: ${errorMessage}`);

            logger.error("payment-capture-core", "Failed to capture PaymentCollection", {
                orderId,
                paymentCollectionId: pc.id,
                isSupplementary,
            }, error instanceof Error ? error : new Error(String(error)));

            // Don't mark metadata - we'll throw and rollback the fulfillment workflow
            // The caller is responsible for sending admin notification and handling the error
        }
    }

    const totalPayments = order.payment_collections.length;
    const allAlreadyCaptured = capturedCount === 0 && skippedCount > 0 && failedCount === 0;

    logger.info("payment-capture-core", "Capture all payments completed", {
        orderId,
        totalPayments,
        capturedCount,
        skippedCount,
        failedCount,
        allAlreadyCaptured,
    });

    return {
        hasPayments: true,
        allAlreadyCaptured,
        capturedCount,
        skippedCount,
        failedCount,
        errors,
    };
}

/**
 * Capture all authorized supplementary PaymentCollections for an order
 *
 * During order modification on standard Stripe accounts (without IC+ pricing),
 * supplementary charges are created and authorized but NOT captured.
 * This function captures them all at fulfillment time.
 *
 * REFACTORED: Now uses Medusa's native capturePaymentWorkflow instead of direct Stripe API calls.
 * This ensures proper PaymentCollection status updates and OrderTransaction creation.
 *
 * Supplementary PaymentCollections are identified by:
 * - status: "authorized"
 * - metadata.supplementary_charge: true
 * - Has a Payment record (created by authorizePaymentSessionStep in supplementary-charge.ts)
 *
 * @deprecated Use captureAllOrderPayments instead, which captures all payments including supplementary
 */
async function captureSupplementaryPaymentCollections(
    container: MedusaContainer,
    orderId: string
): Promise<void> {
    try {
        const query = container.resolve("query");

        // Get all PaymentCollections for this order with their Payment records
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "currency_code",
                "payment_collections.id",
                "payment_collections.status",
                "payment_collections.amount",
                "payment_collections.metadata",
                "payment_collections.payments.id",
                "payment_collections.payments.amount",
                "payment_collections.payments.captured_at",
            ],
            filters: { id: orderId },
        });

        const order = orders?.[0];
        if (!order || !order.payment_collections?.length) {
            logger.debug("payment-capture-core", "No payment collections found for order", { orderId });
            return;
        }

        // Find supplementary PaymentCollections that are authorized but not captured
        // Now we check for Payment records instead of stripe_payment_intent_id in metadata
        const supplementaryPCs = order.payment_collections.filter((pc: any) => {
            const metadata = pc.metadata as Record<string, unknown> | undefined;
            // Check for supplementary_charge as boolean true or string "true"
            const isSupplementary = metadata?.supplementary_charge === true || metadata?.supplementary_charge === "true";
            // Must have a Payment record (created by authorizePaymentSessionStep)
            const hasPaymentRecord = pc.payments && pc.payments.length > 0;
            // Payment must not already be captured
            const paymentNotCaptured = hasPaymentRecord && !pc.payments[0]?.captured_at;

            return (
                pc.status === "authorized" &&
                isSupplementary &&
                hasPaymentRecord &&
                paymentNotCaptured
            );
        });

        if (supplementaryPCs.length === 0) {
            logger.debug("payment-capture-core", "No supplementary PaymentCollections to capture", { orderId });
            return;
        }

        logger.info("payment-capture-core", `Found ${supplementaryPCs.length} supplementary PaymentCollection(s) to capture`, {
            orderId,
            count: supplementaryPCs.length,
        });

        // Import capturePaymentWorkflow dynamically to use native Medusa workflow
        const { capturePaymentWorkflow } = await import("@medusajs/medusa/core-flows");

        // Capture each supplementary PaymentCollection using native workflow
        for (const pcRaw of supplementaryPCs) {
            // Type assertion - filter above ensures these exist
            const pc = pcRaw as {
                id: string;
                amount: number;
                metadata: Record<string, unknown>;
                payments: Array<{ id: string; amount: number; captured_at?: string | Date | null }>;
            };
            const metadata = pc.metadata;
            const payment = pc.payments[0]; // First payment in collection (filter ensures it exists)
            const paymentId = payment.id;

            try {
                logger.info("payment-capture-core", "Capturing supplementary payment via native workflow", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId,
                    amount: pc.amount,
                });

                // Use Medusa's native capturePaymentWorkflow
                // This handles:
                // 1. Calling Stripe provider to capture the PaymentIntent
                // 2. Updating PaymentCollection status to "completed"
                // 3. Creating OrderTransaction record
                // 4. Emitting payment.captured event
                await capturePaymentWorkflow(container).run({
                    input: {
                        payment_id: paymentId,
                        // amount is optional - if not provided, captures full amount
                    },
                });

                logger.info("payment-capture-core", "Supplementary payment captured via native workflow", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId,
                    amount: pc.amount,
                });

            } catch (pcError) {
                // Log but continue with other PCs - don't fail the whole capture
                logger.error("payment-capture-core", "Failed to capture supplementary PaymentCollection", {
                    orderId,
                    paymentCollectionId: pc.id,
                    paymentId,
                }, pcError instanceof Error ? pcError : new Error(String(pcError)));

                // Mark this PC as failed for manual follow-up
                try {
                    const paymentModuleService = container.resolve(Modules.PAYMENT) as any;
                    await paymentModuleService.updatePaymentCollections(pc.id, {
                        metadata: {
                            ...metadata,
                            capture_failed: true,
                            capture_error: pcError instanceof Error ? pcError.message : String(pcError),
                            capture_failed_at: new Date().toISOString(),
                        },
                    });
                } catch (updateError) {
                    logger.error("payment-capture-core", "Failed to update PC metadata after capture failure", {
                        orderId,
                        paymentCollectionId: pc.id,
                    }, updateError instanceof Error ? updateError : new Error(String(updateError)));
                }
            }
        }

    } catch (error) {
        // Log but don't fail - main capture already succeeded
        logger.error("payment-capture-core", "Error capturing supplementary PaymentCollections", {
            orderId,
        }, error instanceof Error ? error : new Error(String(error)));
    }
}
