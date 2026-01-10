import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { logger } from "../../../../utils/logger";

/**
 * GET /store/orders/by-payment-intent?payment_intent_id=pi_xxx
 *
 * CHK-02-B FIX: Robust order lookup endpoint that finds orders by payment_intent_id
 * 
 * This endpoint looks for the payment_intent_id in TWO places:
 * 1. Payment.data.id - Set by Medusa's standard cart completion flow
 * 2. Order.metadata.stripe_payment_intent_id - Set by custom workflows
 *
 * SECURITY CONSTRAINTS:
 * - NO PII: Returns only order_id and status (no shipping_address, items, customer)
 * - NO token minting: Read-only endpoint (client should use /order/status/:id endpoint)
 * - Query optimization: Uses payment module for efficient lookup
 * - Security headers: Cache-Control: no-store, private + X-Content-Type-Options: nosniff
 *
 * Used by storefront checkout.success.tsx to verify order exists after payment.
 * Frontend gets shipping details from Stripe PaymentIntent, not from this endpoint.
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    // SEC-02: Set security headers FIRST (before any response)
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const paymentIntentId = req.query.payment_intent_id as string;

    // SEC-02: Input validation - Stripe PaymentIntent IDs start with "pi_" and are 27-28 chars
    if (!paymentIntentId) {
        res.status(400).json({
            error: "payment_intent_id query parameter is required",
            code: "MISSING_PAYMENT_INTENT_ID",
        });
        return;
    }

    // Validate format: Stripe PI IDs are "pi_[a-zA-Z0-9]{24}" (27 chars total)
    if (typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_") || paymentIntentId.length < 27 || paymentIntentId.length > 28) {
        logger.warn("by-payment-intent", "Invalid payment_intent_id format", {
            paymentIntentId: paymentIntentId.substring(0, 10) + "...",
            length: paymentIntentId.length,
        });
        res.status(400).json({
            error: "Invalid payment_intent_id format",
            code: "INVALID_PAYMENT_INTENT_ID",
        });
        return;
    }

    try {
        const query = req.scope.resolve("query");
        let foundOrderId: string | null = null;
        let lookupMethod: string = "none";

        // ==========================================
        // METHOD 1: Query payments to find matching payment_intent_id in data
        // This is the PRIMARY lookup method for orders created via standard cart completion
        // ==========================================
        try {
            const paymentModuleService = req.scope.resolve("payment") as any;
            
            // Get recent payments (sorted by creation date descending to find newest first)
            // Note: Don't use select[] as it doesn't properly return JSONB data field
            const recentPayments = await paymentModuleService.listPayments(
                {},
                { take: 200, order: { created_at: "DESC" } }
            );

            for (const payment of recentPayments) {
                const paymentData = payment.data as any;
                if (paymentData?.id === paymentIntentId) {
                    // Found the payment! Now find the order linked to this payment collection
                    const paymentCollectionId = payment.payment_collection_id;
                    if (paymentCollectionId) {
                        // Query order with specific payment collection filter
                        // Using filters: { id: orderId } works properly, we just need to find the order ID
                        // Try to find order by querying each recent order individually
                        const { data: recentOrders } = await query.graph({
                            entity: "order",
                            fields: ["id"],
                            pagination: { take: 100, order: { created_at: "DESC" } },
                        }) as { data: Array<{ id: string }> };

                        for (const order of recentOrders) {
                            // Query this specific order with payment_collections relation
                            const { data: orderWithPC } = await query.graph({
                                entity: "order",
                                fields: ["id", "status", "payment_collections.id"],
                                filters: { id: order.id },
                            }) as { data: Array<{ id: string; status: string; payment_collections?: Array<{ id: string }> }> };
                            
                            if (orderWithPC.length > 0) {
                                const hasPC = orderWithPC[0].payment_collections?.some(
                                    (pc) => pc?.id === paymentCollectionId
                                );
                                if (hasPC) {
                                    foundOrderId = order.id;
                                    lookupMethod = "payment_collection";
                                    break;
                                }
                            }
                        }
                    }
                    break; // Stop searching payments once we found a match
                }
            }
        } catch (paymentError) {
            // Log and continue to fallback method
            logger.warn("by-payment-intent", "Payment module lookup failed", {
                error: (paymentError as Error).message,
            });
        }

        // ==========================================
        // METHOD 2: Check order metadata (fallback for custom workflows)
        // ==========================================
        if (!foundOrderId) {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const { data: recentOrders } = await query.graph({
                entity: "order",
                fields: ["id", "status", "created_at", "metadata"],
                pagination: { take: 200 },
            });

            const ordersFromMetadata = (recentOrders as any[]).filter((order: any) => {
                const orderDate = new Date(order.created_at);
                return (
                    orderDate >= twentyFourHoursAgo &&
                    order.metadata?.stripe_payment_intent_id === paymentIntentId
                );
            });

            if (ordersFromMetadata.length > 0) {
                foundOrderId = ordersFromMetadata[0].id;
                lookupMethod = "metadata";
            }
        }

        // ==========================================
        // Return result
        // ==========================================
        if (foundOrderId) {
            // Fetch order status if not already known
            const { data: foundOrders } = await query.graph({
                entity: "order",
                fields: ["id", "status"],
                filters: { id: foundOrderId },
            });

            if (foundOrders.length > 0) {
                const order = foundOrders[0] as { id: string; status: string };
                logger.info("by-payment-intent", "Order lookup by payment intent", {
                    orderId: order.id,
                    orderStatus: order.status,
                    paymentIntentId: paymentIntentId.substring(0, 10) + "...",
                    found: true,
                    method: lookupMethod,
                });

                res.status(200).json({
                    order: {
                        id: order.id,
                        status: order.status,
                    },
                });
                return;
            }
        }

        // Not found
        logger.info("by-payment-intent", "Order lookup by payment intent - not found", {
            paymentIntentId: paymentIntentId.substring(0, 10) + "...",
            found: false,
        });

        res.status(404).json({
            error: "Order not found",
            code: "ORDER_NOT_FOUND",
            message: "Order is still being processed. Please try again in a few seconds.",
            retry: true,
        });

    } catch (error: any) {
        logger.error("by-payment-intent", "Failed to fetch order by payment intent", {
            paymentIntentId,
            errorName: error?.name,
            errorMessage: error?.message,
        }, error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "FETCH_FAILED",
        });
    }
}
