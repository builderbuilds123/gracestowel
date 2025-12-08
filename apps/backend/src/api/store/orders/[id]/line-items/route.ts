import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";
import Stripe from "stripe";
import { getStripeClient } from "../../../../../utils/stripe";

/**
 * POST /store/orders/:id/line-items
 * 
 * Add items to an order within the 1-hour modification window.
 * Handles incremental authorization for the additional amount.
 * 
 * Body:
 * - token: The modification JWT token (required)
 * - items: Array of items to add (required)
 *   - variant_id: string
 *   - quantity: number
 */

// Stripe client imported from ../../../../../utils/stripe

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const { token, items } = req.body as {
        token: string;
        items: Array<{
            variant_id: string;
            quantity: number;
        }>;
    };

    // Validate required fields
    if (!token) {
        res.status(400).json({
            error: "Modification token is required",
            code: "TOKEN_REQUIRED",
        });
        return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
            error: "Items array is required and must not be empty",
            code: "ITEMS_REQUIRED",
        });
        return;
    }

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            error: validation.error,
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            expired: validation.expired,
            message: validation.expired 
                ? "The 1-hour modification window has expired."
                : "Invalid modification token",
        });
        return;
    }

    // Verify the token is for this order
    if (validation.payload?.order_id !== id) {
        res.status(403).json({
            error: "Token does not match this order",
            code: "TOKEN_MISMATCH",
        });
        return;
    }

    // Check if the order is still within the modification window
    const remainingTime = modificationTokenService.getRemainingTime(token);
    if (remainingTime <= 0) {
        res.status(400).json({
            error: "Modification window has expired",
            code: "WINDOW_EXPIRED",
        });
        return;
    }

    // Verify order exists and is not canceled
    const query = req.scope.resolve("query");
    const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "status", "total", "currency_code", "metadata", "items.*"],
        filters: { id },
    });

    if (!orders.length) {
        res.status(404).json({
            error: "Order not found",
            code: "ORDER_NOT_FOUND",
        });
        return;
    }

    const order = orders[0];
    if (order.status === "canceled") {
        res.status(400).json({
            error: "Cannot modify a canceled order",
            code: "ORDER_CANCELED",
        });
        return;
    }

    const paymentIntentId = order.metadata?.stripe_payment_intent_id;
    if (!paymentIntentId) {
        res.status(400).json({
            error: "No payment intent found for this order",
            code: "NO_PAYMENT_INTENT",
        });
        return;
    }

    try {
        // Fetch variant details and calculate additional amount
        let additionalAmount = 0;
        const newLineItems: Array<{
            variant_id: string;
            title: string;
            quantity: number;
            unit_price: number;
        }> = [];

        for (const item of items) {
            const { data: variants } = await query.graph({
                entity: "product_variant",
                fields: ["id", "title", "calculated_price.*", "product.title"],
                filters: { id: item.variant_id },
            });

            if (!variants.length) {
                res.status(400).json({
                    error: `Variant ${item.variant_id} not found`,
                    code: "VARIANT_NOT_FOUND",
                });
                return;
            }

            const variant = variants[0] as any;
            const price = variant.calculated_price;

            if (!price || !price.calculated_amount) {
                res.status(400).json({
                    error: `No price found for variant ${item.variant_id} in ${order.currency_code}`,
                    code: "PRICE_NOT_FOUND",
                });
                return;
            }

            const itemTotal = price.calculated_amount * item.quantity;
            additionalAmount += itemTotal;

            newLineItems.push({
                variant_id: item.variant_id,
                title: `${variant.product?.title || ''} - ${variant.title || ''}`.trim(),
                quantity: item.quantity,
                unit_price: price.calculated_amount,
            });
        }

        // Get current payment intent to check amount
        const stripe = getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string);

        // Calculate new total
        const currentAmount = paymentIntent.amount;
        const newTotalAmount = currentAmount + additionalAmount;

        // Update payment intent with new amount (incremental authorization)
        await stripe.paymentIntents.update(paymentIntentId as string, {
            amount: newTotalAmount,
        });

        console.log(`Updated PaymentIntent ${paymentIntentId} from ${currentAmount} to ${newTotalAmount}`);

        // Add line items to order using the order module
        // Note: In Medusa v2, we need to use the proper order module methods
        // For now, we'll store the added items in metadata since updateOrders
        // doesn't support adding line items directly
        const orderService = req.scope.resolve("order");

        // Store added items in order metadata
        const existingAddedItems = order.metadata?.added_items
            ? JSON.parse(order.metadata.added_items as string)
            : [];

        const allAddedItems = [...existingAddedItems, ...newLineItems];

        await orderService.updateOrders([{
            id,
            metadata: {
                ...order.metadata,
                added_items: JSON.stringify(allAddedItems),
                updated_total: newTotalAmount,
            },
        }]);

        console.log(`Added ${newLineItems.length} items to order ${id}`);

        res.status(200).json({
            success: true,
            message: "Items added successfully",
            order_id: id,
            added_items: newLineItems,
            additional_amount: additionalAmount,
            new_total: newTotalAmount,
        });
    } catch (error) {
        console.error("Error adding items:", error);
        res.status(500).json({
            error: "Failed to add items",
            code: "ADD_ITEMS_FAILED",
            message: "An error occurred while adding items. Please try again.",
        });
    }
}

