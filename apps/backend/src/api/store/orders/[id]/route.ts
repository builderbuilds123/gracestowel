import {
    MedusaRequest,
    MedusaResponse,
    AuthenticatedMedusaRequest,
} from "@medusajs/framework/http";
import { authenticateOrderAccess } from "../../../../utils/order-auth";
import { logger } from "../../../../utils/logger";
import { logOrderModificationAttempt } from "../../../../utils/audit-logger";
import { modificationTokenService } from "../../../../services/modification-token";

/**
 * Order display states for the frontend
 */
type OrderDisplayStatus = "editable" | "processing" | "shipped" | "delivered" | "canceled";

interface OrderState {
    display_status: OrderDisplayStatus;
    can_edit: boolean;
    can_cancel: boolean;
    can_return: boolean;
    can_rate: boolean;
    message: string | null;
}

const CAPTURED_PAYMENT_STATUSES = ["captured", "completed", "partially_captured"];
const SHIPPED_FULFILLMENT_STATUSES = ["shipped", "partially_shipped"];
const DELIVERED_FULFILLMENT_STATUSES = ["delivered", "partially_delivered"];
const FULFILLED_STATUSES = ["fulfilled", "partially_fulfilled", ...SHIPPED_FULFILLMENT_STATUSES, ...DELIVERED_FULFILLMENT_STATUSES];

/**
 * Compute payment status from order's payment collections
 */
function computePaymentStatus(order: any): string {
    const paymentCollection = order.payment_collections?.[0];
    if (!paymentCollection) return "unknown";

    // Check if payment has been captured
    const payment = paymentCollection.payments?.[0];
    if (payment?.captured_at) {
        return "captured";
    }

    // Use payment collection status
    return paymentCollection.status || "unknown";
}

/**
 * Compute the order state for frontend display
 */
function computeOrderState(
    order: any,
    fulfillmentStatus: string,
    paymentStatus: string,
    canModifyFromToken: boolean
): OrderState {
    // Canceled - no actions available
    if (order.status === "canceled") {
        return {
            display_status: "canceled",
            can_edit: false,
            can_cancel: false,
            can_return: false,
            can_rate: false,
            message: "This order has been canceled",
        };
    }

    // Delivered - can return and rate
    if (DELIVERED_FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
        return {
            display_status: "delivered",
            can_edit: false,
            can_cancel: false,
            can_return: true,
            can_rate: true,
            message: null,
        };
    }

    // Shipped - tracking only
    if (SHIPPED_FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
        return {
            display_status: "shipped",
            can_edit: false,
            can_cancel: false,
            can_return: false,
            can_rate: false,
            message: "Your order is on its way",
        };
    }

    // Being processed (payment captured but not shipped/fulfilled)
    if (CAPTURED_PAYMENT_STATUSES.includes(paymentStatus) && !FULFILLED_STATUSES.includes(fulfillmentStatus)) {
        return {
            display_status: "processing",
            can_edit: false,
            can_cancel: false,
            can_return: false,
            can_rate: false,
            message: "Order is being processed. Modifications are no longer available.",
        };
    }

    // Editable (payment authorized/not captured, not fulfilled, within modification window)
    if (!CAPTURED_PAYMENT_STATUSES.includes(paymentStatus) && !FULFILLED_STATUSES.includes(fulfillmentStatus)) {
        return {
            display_status: "editable",
            can_edit: canModifyFromToken,
            can_cancel: canModifyFromToken,
            can_return: false,
            can_rate: false,
            message: null,
        };
    }

    // Default: view only (fulfilled but not shipped/delivered - rare state)
    return {
        display_status: "processing",
        can_edit: false,
        can_cancel: false,
        can_return: false,
        can_rate: false,
        message: null,
    };
}

/**
 * GET /store/orders/:id
 * 
 * Story 2.2, 2.3: Fetch order details with dual authentication support
 * 
 * Supports:
 * - Customer session (logged-in customers)
 * - Guest token (via x-modification-token header)
 * 
 * Query Parameters:
 * - token: The modification JWT token (optional if customer is logged in)
 */
export async function GET(
    req: MedusaRequest | AuthenticatedMedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;

    try {
        // Fetch order from database
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "display_id",
                "email",
                "status",
                "fulfillment_status",
                "currency_code",
                "total",
                "subtotal",
                "tax_total",
                "shipping_total",
                "discount_total",
                "original_total",
                "created_at",
                "customer_id",
                "items.*",
                "items.subtotal",
                "items.total",
                "items.adjustments.*",
                "items.variant.*",
                "items.variant.product.*",
                "shipping_address.*",
                "shipping_methods.*",
                "shipping_methods.adjustments.*",
                "metadata",
                "payment_collections.*",
                "payment_collections.payments.*",
            ],
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

        // Story 2.3: Unified authentication
        const authResult = await authenticateOrderAccess(req, order);

        // Story 2.5: Audit logging
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || 
                   (req.headers["x-real-ip"] as string) || 
                   req.ip || 
                   "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";

        logOrderModificationAttempt({
            orderId: order.id,
            action: "view",
            authMethod: authResult.method,
            customerId: authResult.customerId,
            ip,
            userAgent,
            success: authResult.authenticated,
            failureReason: authResult.authenticated ? undefined : "UNAUTHORIZED",
        });

        if (!authResult.authenticated) {
            res.status(401).json({
                error: "You do not have permission to view this order.",
                code: "UNAUTHORIZED",
            });
            return;
        }

        // Calculate modification window (if guest token)
        let remainingTime = 0;
        let canModify = false;
        
        if (authResult.method === "guest_token") {
            const token = req.headers["x-modification-token"] as string;
            if (token) {
                remainingTime = modificationTokenService.getRemainingTime(token);
                canModify = remainingTime > 0 && order.status !== "canceled";
            }
        } else {
            // For customer sessions, check eligibility via separate endpoint
            // Frontend will call /store/orders/:id/eligibility separately
            canModify = false; // Will be determined by eligibility check
        }

        // Extract unique promo codes from all adjustments
        const promoCodes = new Map<string, { code: string; amount: number }>();
        order.items?.forEach((item: any) => {
            item.adjustments?.forEach((adj: any) => {
                if (adj.code) {
                    const existing = promoCodes.get(adj.code);
                    promoCodes.set(adj.code, {
                        code: adj.code,
                        amount: (existing?.amount || 0) + (adj.amount || 0),
                    });
                }
            });
        });
        order.shipping_methods?.forEach((sm: any) => {
            sm.adjustments?.forEach((adj: any) => {
                if (adj.code) {
                    const existing = promoCodes.get(adj.code);
                    promoCodes.set(adj.code, {
                        code: adj.code,
                        amount: (existing?.amount || 0) + (adj.amount || 0),
                    });
                }
            });
        });

        // Compute order state for frontend display
        // Note: fulfillment_status is queried from DB but not in the TS Order type
        const fulfillmentStatus = (order as any).fulfillment_status || "not_fulfilled";
        const paymentStatus = computePaymentStatus(order);
        const orderState = computeOrderState(order, fulfillmentStatus, paymentStatus, canModify);

        res.status(200).json({
            order: {
                id: order.id,
                display_id: order.display_id,
                email: order.email,
                status: order.status,
                fulfillment_status: fulfillmentStatus,
                currency_code: order.currency_code,
                total: order.total,
                subtotal: order.subtotal,
                tax_total: order.tax_total,
                shipping_total: order.shipping_total,
                discount_total: order.discount_total,
                original_total: order.original_total,
                created_at: order.created_at,
                promo_codes: Array.from(promoCodes.values()),
                items: order.items?.map((item: any) => ({
                    id: item.id,
                    title: item.variant?.product?.title || item.title,
                    variant_title: item.variant?.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    subtotal: item.subtotal,
                    total: item.total,
                    thumbnail: item.variant?.product?.thumbnail,
                    metadata: item.metadata,
                })),
                shipping_address: order.shipping_address,
            },
            order_state: orderState,
            payment_status: paymentStatus,
            authMethod: authResult.method,
            canEdit: canModify, // Frontend will call eligibility endpoint separately
            modification: authResult.method === "guest_token" ? {
                can_modify: canModify,
                remaining_seconds: remainingTime,
                expires_at: new Date(Date.now() + remainingTime * 1000).toISOString(),
            } : undefined,
        });
    } catch (error) {
        logger.error("order-view", "Error fetching order", { orderId: id }, error as Error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "INTERNAL_ERROR",
        });
    }
}

