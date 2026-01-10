import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch, type CloudflareEnv } from "../utils/monitored-fetch";

/**
 * POST /api/carts/:id/complete
 * Completes a Medusa cart.
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ error: "Method not allowed" }, { status: 405 });
    }

    const cartId = params.id;
    if (!cartId) {
        return data({ error: "Cart ID is required" }, { status: 400 });
    }

    const env = context.cloudflare.env as CloudflareEnv & {
        MEDUSA_BACKEND_URL?: string;
        MEDUSA_PUBLISHABLE_KEY?: string;
    };
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    if (!medusaPublishableKey) {
        return data({ error: "Missing MEDUSA_PUBLISHABLE_KEY" }, { status: 500 });
    }

    try {
        const response = await monitoredFetch(`${medusaBackendUrl}/store/carts/${cartId}/complete`, {
            method: "POST",
            headers: {
                "x-publishable-api-key": medusaPublishableKey,
                "Content-Type": "application/json",
            },
            label: "medusa-cart-complete",
            cloudflareEnv: env,
        });

        if (!response.ok) {
            const errorData = await response.json() as { message?: string; type?: string };
            console.error(`Failed to complete cart ${cartId}:`, errorData);
            return data({
                error: errorData.message || "Failed to complete cart",
                details: errorData.type || undefined,
            }, { status: response.status });
        }

        const result = await response.json() as any;

        // Medusa v2 response handling
        // Response can be { type: "order", order: ... } or { type: "cart", cart: ... }
        // or sometimes just { order: ... }
        const completedOrder = result.order || (result.type === 'order' ? result.order : undefined);
        const completedCart = result.cart || (result.type === 'cart' ? result.cart : undefined) || (result.data ? result.data : undefined);

        const resourceId = completedOrder?.id || completedCart?.id;
        const displayId = completedOrder?.display_id || completedCart?.display_id;

        if (!resourceId) {
             console.error(`Failed to extract ID from completion response for cart ${cartId}`);
             throw new Error("Invalid completion response from Medusa");
        }

        console.log(`Cart ${cartId} completed successfully. Resource ID: ${resourceId}`);

        return data({
            success: true,
            orderId: resourceId,
            orderNumber: displayId,
        }, { status: 200 });

    } catch (error: any) {
        console.error(`Error completing cart ${cartId}:`, error);
        return data({
            error: "An unexpected error occurred during cart completion",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        }, { status: 500 });
    }
}

