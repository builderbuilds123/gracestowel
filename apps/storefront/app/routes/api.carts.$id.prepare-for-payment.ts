import { type ActionFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";
import { monitoredFetch, type CloudflareEnv } from "../utils/monitored-fetch";

interface PrepareForPaymentRequest {
    shipping_option_id: string;
    email: string;
    shipping_address: any;
    payment_collection_id: string;
}

/**
 * POST /api/carts/:id/prepare-for-payment
 * 
 * Orchestrates multiple checkout preparation steps in a single atomic backend call:
 * 1. Persists the selected shipping method.
 * 2. Syncs the latest email and shipping address to the cart.
 * 3. Refreshes the payment session to ensure the PaymentIntent reflects the total.
 * 
 * Returns the new client_secret for Stripe confirmation.
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
    const traceId = getTraceIdFromRequest(request);
    const logger = createLogger({ traceId });
    const cartId = params.id;

    if (request.method !== "POST") {
        return data({ error: "Method not allowed" }, { status: 405 });
    }

    if (!cartId) {
        return data({ error: "Cart ID is required" }, { status: 400 });
    }

    let body: PrepareForPaymentRequest;
    try {
        body = await request.json();
    } catch {
        return data({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { shipping_option_id, email, shipping_address, payment_collection_id } = body;

    if (!shipping_option_id || !email || !shipping_address || !payment_collection_id) {
        return data({ error: "Missing required fields" }, { status: 400 });
    }

    const cartService = new MedusaCartService(context);
    const env = context.cloudflare.env as CloudflareEnv & {
        MEDUSA_BACKEND_URL?: string;
        MEDUSA_PUBLISHABLE_KEY?: string;
    };
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    try {
        logger.info('[CHECKOUT][ATOMIC] Starting preparation orchestration', { cartId, paymentCollectionId: payment_collection_id });

        // Phase 1: Update shipping method
        // This persists selection and updates cart totals
        await cartService.addShippingMethod(cartId, shipping_option_id);
        logger.info('[CHECKOUT][ATOMIC] Shipping method persisted', { shipping_option_id });

        // Phase 2: Sync email and address
        // This ensures the cart has the latest customer info for the order
        await cartService.updateCart(cartId, {
            email,
            shipping_address: {
                ...shipping_address,
                country_code: (shipping_address.country_code || "").toLowerCase(),
            }
        });
        logger.info('[CHECKOUT][ATOMIC] Cart email/address synced', { email });

        // Phase 3: Refresh payment session
        // This forces Medusa to sync the cart total to the Stripe PaymentIntent
        const sessionResponse = await monitoredFetch(
            `${medusaBackendUrl}/store/payment-collections/${payment_collection_id}/payment-sessions`,
            {
                method: "POST",
                headers: {
                    "x-publishable-api-key": medusaPublishableKey || "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ provider_id: "pp_stripe" }),
                label: "atomic-session-refresh",
                cloudflareEnv: env,
            }
        );

        if (!sessionResponse.ok) {
            const errorData = await sessionResponse.json() as { message?: string };
            logger.error('[CHECKOUT][ATOMIC] Failed to refresh payment session', new Error(errorData.message || 'Unknown error'), errorData);
            throw new Error('Payment service sync failed');
        }

        const sessionData = await sessionResponse.json() as any;
        const updatedClientSecret = sessionData.payment_collection?.payment_sessions?.find(
            (s: any) => s.provider_id === "pp_stripe"
        )?.data?.client_secret;

        if (!updatedClientSecret) {
            logger.error('[CHECKOUT][ATOMIC] Client secret missing after refresh', new Error('Missing client_secret'));
            throw new Error('Stripe session sync failed');
        }

        logger.info('[CHECKOUT][ATOMIC] Orchestration complete', { cartId });

        return data({
            success: true,
            client_secret: updatedClientSecret
        }, { status: 200 });

    } catch (error: any) {
        logger.error('[CHECKOUT][ATOMIC] Orchestration failed', error);
        
        const status = error.status || 500;
        return data({
            error: "Checkout preparation failed",
            message: error.message || "An unexpected error occurred",
            details: env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: status >= 400 && status < 600 ? status : 500 });
    }
}
