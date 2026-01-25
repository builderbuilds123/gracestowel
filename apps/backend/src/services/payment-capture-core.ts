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
    const logger = container.resolve("logger");

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
    const logger = container.resolve("logger");
    const stripe = getStripeClient();

    logger.info("payment-capture-core", "Executing payment capture", { orderId, paymentIntentId });

    // Step 1: Check Stripe status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === "canceled") {
        logger.info("payment-capture-core", "Payment was canceled", { orderId, paymentIntentId });
        return;
    }

    if (paymentIntent.status === "succeeded") {
        logger.info("payment-capture-core", "Payment already captured in Stripe", { orderId, paymentIntentId });
        // Still proceed to update Medusa state to be sure
    } else if (paymentIntent.status !== "requires_capture") {
        logger.warn("payment-capture-core", "PaymentIntent not in capturable state", { 
            orderId, 
            status: paymentIntent.status 
        });
        return;
    }

    // Step 2: Fetch Order Total
    const orderData = await fetchOrderTotal(container, orderId);
    if (!orderData) {
        logger.error("payment-capture-core", "Could not fetch order data", { orderId });
        return;
    }

    const { totalCents, currencyCode, status } = orderData;
    
    // Guard: Do not capture if order is canceled in Medusa
    if (status === "canceled") {
        logger.warn("payment-capture-core", "Skipping capture: Order is canceled", { orderId });
        return;
    }

    const amountToCapture = paymentIntent.amount_capturable ?? totalCents;

    // Validation: Ensure we don't capture more than authorized
    if (totalCents > amountToCapture) {
        // Story 3.2 / 6.3: If order total changed and exceeds auth, we can only capture auth amount
        // (Unless we support partial capture + re-auth, but per current logic we cap at capturable)
        logger.warn("payment-capture-core", "Order total exceeds capturable amount", {
            orderId,
            totalCents,
            amountToCapture
        });
    }
    
    // Determine final capture amount (min of total vs capturable)
    const finalCaptureAmount = Math.min(totalCents, amountToCapture);

    // Step 3: Capture via Stripe
    if (paymentIntent.status === "requires_capture") {
        try {
            await stripe.paymentIntents.capture(paymentIntentId, {
                amount_to_capture: finalCaptureAmount,
            }, {
                idempotencyKey: idempotencyKey // Passed from workflow or worker for safety
            });
            logger.info("payment-capture-core", "Stripe capture successful", { 
                orderId, 
                amount: finalCaptureAmount 
            });
        } catch (error) {
            logger.error("payment-capture-core", "Stripe capture failed", { orderId }, error);
            throw error;
        }
    }

    // Step 4: Update Medusa Records
    await updateOrderAfterCapture(container, orderId, finalCaptureAmount);
}

// Helper: Update Order Logic (Migrated from worker)
export async function updateOrderAfterCapture(
    container: MedusaContainer, 
    orderId: string, 
    amountCaptured: number
): Promise<void> {
    const logger = container.resolve("logger");
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
    const logger = container.resolve("logger");
    
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

        // Type assertion for Medusa Payment Module
        interface PaymentModuleService {
            updatePaymentCollections: (updates: Array<{ id: string; status: string }>) => Promise<void>;
        }
        const paymentModuleService = container.resolve(Modules.PAYMENT) as unknown as PaymentModuleService;
        
        await paymentModuleService.updatePaymentCollections([
            {
                id: collection.id,
                status: PaymentCollectionStatus.COMPLETED,
            },
        ]);

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
    const logger = container.resolve("logger");
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
