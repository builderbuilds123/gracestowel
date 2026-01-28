/**
 * Payment Capture Core Logic
 *
 * Shared logic for capturing payments, used by:
 * 1. Fulfillment capture hook (immediate capture on fulfillment)
 * 2. BullMQ fallback worker (delayed capture safety net)
 * 3. Capture payment workflow step
 *
 * The main entry point is `captureAllOrderPayments()` which implements
 * the smart capture algorithm: fetches real order total, distributes
 * across all uncaptured PIs, partial captures where needed, and
 * cancels excess PIs.
 */

import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { logger } from "../utils/logger";

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
            "metadata",
            "summary.*",
            "payment_collections.id",
            "payment_collections.status",
            "payment_collections.amount",
            "payment_collections.metadata",
            "payment_collections.payments.id",
            "payment_collections.payments.amount",
            "payment_collections.payments.captured_at",
            "payment_collections.payments.canceled_at",
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

    // Source of truth: real order total from metadata.updated_total / summary / order.total
    // Do NOT use sum(PC amounts) — supplementary PCs may remain authorized after a
    // decrease, making the PC sum exceed the actual order total.
    const orderTotalData = await fetchOrderTotal(container, orderId);
    if (!orderTotalData) {
        throw new Error(`Could not fetch order total for ${orderId}`);
    }
    const orderTotal = orderTotalData.totalCents / 100; // fetchOrderTotal returns cents
    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
        logger.error("payment-capture-core", "Invalid order total", { orderId, orderTotal });
        throw new Error(`Invalid order total for order ${orderId}: ${orderTotal}`);
    }

    // Collect uncaptured payments with their PC and authorized amounts
    type UncapturedPayment = {
        paymentId: string;
        paymentCollectionId: string;
        authorizedAmount: number;
        currentPcAmount: number;
        isSupplementary: boolean;
        stripePaymentIntentId?: string;
    };
    const uncapturedPayments: UncapturedPayment[] = [];

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
                canceled_at?: string | Date | null;
                data?: { id?: string };
            }>;
        };

        // Skip if already completed/captured
        if (pc.status === "completed" || pc.status === "captured") {
            skippedCount++;
            continue;
        }

        const payment = pc.payments?.[0];
        if (!payment) {
            continue;
        }

        if (payment.captured_at) {
            skippedCount++;
            continue;
        }

        // Skip payments that were voided (canceled) in a previous capture run
        if (payment.canceled_at) {
            skippedCount++;
            continue;
        }

        uncapturedPayments.push({
            paymentId: payment.id,
            paymentCollectionId: pc.id,
            authorizedAmount: Number(payment.amount),
            currentPcAmount: Number(pc.amount),
            isSupplementary: pc.metadata?.supplementary_charge === true ||
                             pc.metadata?.supplementary_charge === "true",
            stripePaymentIntentId: payment.data?.id,
        });
    }

    // If nothing to capture, return early
    if (uncapturedPayments.length === 0) {
        const allAlreadyCaptured = skippedCount > 0;
        logger.info("payment-capture-core", "No uncaptured payments found", {
            orderId, skippedCount, allAlreadyCaptured,
        });
        return {
            hasPayments: true,
            allAlreadyCaptured,
            capturedCount: 0,
            skippedCount,
            failedCount: 0,
            errors: [],
        };
    }

    // Guard: total authorized must cover the order total.
    // If not, throw so the workflow can rollback and compensate previous steps.
    const totalAuthorized = uncapturedPayments.reduce((sum, p) => sum + p.authorizedAmount, 0);
    if (totalAuthorized < orderTotal) {
        const shortfall = orderTotal - totalAuthorized;
        logger.error("payment-capture-core", "Insufficient authorized amount for capture", {
            orderId,
            orderTotal,
            totalAuthorized,
            shortfall,
            uncapturedCount: uncapturedPayments.length,
        });
        throw new Error(
            `Insufficient authorized amount for order ${orderId}: ` +
            `authorized $${totalAuthorized.toFixed(2)} but order total is $${orderTotal.toFixed(2)} ` +
            `(shortfall: $${shortfall.toFixed(2)})`
        );
    }

    // Sort ascending by authorized amount (capture smaller PIs fully first)
    uncapturedPayments.sort((a, b) => a.authorizedAmount - b.authorizedAmount);

    logger.info("payment-capture-core", "Smart capture: starting", {
        orderId,
        orderTotal,
        uncapturedCount: uncapturedPayments.length,
        payments: uncapturedPayments.map(p => ({
            paymentId: p.paymentId,
            authorizedAmount: p.authorizedAmount,
            isSupplementary: p.isSupplementary,
        })),
    });

    // Import capturePaymentWorkflow and payment module
    const { capturePaymentWorkflow } = await import("@medusajs/medusa/core-flows");
    const paymentModuleService = container.resolve(Modules.PAYMENT);

    let remainingToPay = orderTotal;

    for (const up of uncapturedPayments) {
        if (remainingToPay <= 0) {
            // Order total fully covered — cancel the excess payment to release the hold.
            // Use Medusa's cancelPayment which:
            // 1. Calls provider.cancelPayment → cancels Stripe PI
            // 2. Sets Payment.canceled_at → Admin UI shows "Canceled" (not "Pending")
            logger.info("payment-capture-core", "Cancelling excess payment - order total fully covered", {
                orderId,
                paymentId: up.paymentId,
                paymentIntentId: up.stripePaymentIntentId,
            });
            try {
                await paymentModuleService.cancelPayment(up.paymentId);
                // Set PC amount to 0 so Medusa's getLastPaymentStatus() counts it
                // as fully captured (amount=0 → capturedCount += 1).
                // Do NOT set status to "canceled" — that breaks payment_status by
                // excluding this PC from totalPaymentExceptCanceled while still
                // counting its captured_amount toward capturedCount.
                await paymentModuleService.updatePaymentCollections(up.paymentCollectionId, {
                    amount: 0,
                });
                logger.info("payment-capture-core", "Voided excess payment and zeroed PC amount", {
                    orderId,
                    paymentId: up.paymentId,
                    paymentCollectionId: up.paymentCollectionId,
                });
            } catch (cancelError) {
                logger.error("payment-capture-core", "Failed to cancel excess payment", {
                    orderId,
                    paymentId: up.paymentId,
                    paymentIntentId: up.stripePaymentIntentId,
                }, cancelError instanceof Error ? cancelError : new Error(String(cancelError)));
            }
            skippedCount++;
            continue;
        }

        const captureAmount = Math.min(up.authorizedAmount, remainingToPay);
        const isPartial = captureAmount < up.authorizedAmount;
        const captureAmountCents = Math.round(captureAmount * 100);

        // Update PC.amount to captureAmount BEFORE capture
        // This ensures capturePaymentWorkflow sees a full capture → status = completed
        if (Math.abs(captureAmount - up.currentPcAmount) > 0.01) {
            await paymentModuleService.updatePaymentCollections(up.paymentCollectionId, {
                amount: captureAmount,
            });
            logger.info("payment-capture-core", "Updated PC amount before capture", {
                orderId,
                paymentCollectionId: up.paymentCollectionId,
                previousAmount: up.currentPcAmount,
                newAmount: captureAmount,
            });
        }

        logger.info("payment-capture-core", `Capturing ${up.isSupplementary ? "supplementary" : "original"} payment`, {
            orderId,
            paymentId: up.paymentId,
            captureAmount,
            captureAmountCents,
            authorizedAmount: up.authorizedAmount,
            isPartial,
            remainingToPay,
        });

        try {
            // For partial captures, update Payment.amount AND write amount_to_capture
            // into payment.data so:
            // 1. Payment.amount matches capture amount → Medusa sets captured_at
            //    (internal check: capturedAmount >= paymentAmount → set captured_at)
            // 2. Custom Stripe provider reads amount_to_capture from payment.data
            //    and passes it to Stripe's paymentIntents.capture API
            if (isPartial && up.stripePaymentIntentId) {
                // UpdatePaymentDTO type only declares `id`, but the runtime service
                // supports `amount` and `data` fields for internal payment updates.
                await paymentModuleService.updatePayment({
                    id: up.paymentId,
                    amount: captureAmount,
                    data: {
                        id: up.stripePaymentIntentId,
                        amount_to_capture: captureAmountCents,
                    },
                } as any);
                logger.info("payment-capture-core", "Updated Payment for partial capture", {
                    orderId,
                    paymentId: up.paymentId,
                    paymentIntentId: up.stripePaymentIntentId,
                    previousAmount: up.authorizedAmount,
                    newAmount: captureAmount,
                    amountToCaptureCents: captureAmountCents,
                });
            }

            // Call Medusa's capturePaymentWorkflow to capture via the Stripe provider.
            // For partial captures: the custom provider reads amount_to_capture from
            // payment.data and passes it to Stripe.
            // For full captures: Stripe captures the full authorized amount as normal.
            await capturePaymentWorkflow(container).run({
                input: {
                    payment_id: up.paymentId,
                    amount: captureAmount,
                },
            });
            remainingToPay -= captureAmount;
            capturedCount++;

            logger.info("payment-capture-core", "Payment captured", {
                orderId,
                paymentId: up.paymentId,
                captureAmount,
                captureAmountCents,
                remainingToPay,
            });
        } catch (error) {
            failedCount++;
            errors.push(`Payment ${up.paymentId}: ${error instanceof Error ? error.message : String(error)}`);
            logger.error("payment-capture-core", "Failed to capture payment", {
                orderId, paymentId: up.paymentId, captureAmount,
            }, error instanceof Error ? error : new Error(String(error)));
        }
    }

    const totalPayments = order.payment_collections.length;
    const allAlreadyCaptured = capturedCount === 0 && skippedCount > 0 && failedCount === 0;

    logger.info("payment-capture-core", "Smart capture completed", {
        orderId,
        totalPayments,
        orderTotal,
        capturedCount,
        skippedCount,
        failedCount,
        remainingToPay,
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

