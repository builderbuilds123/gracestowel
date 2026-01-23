import {
    defineMiddlewares,
    MedusaNextFunction,
    type MedusaRequest,
    type MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { trackEvent } from "../utils/analytics";
import { logger } from "../utils/logger";
import { orderEditRateLimiter } from "../utils/rate-limiter";

function normalizeCartCountryCodesMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    const body = (req as any).body as any;

    const normalizeAddress = (address: any) => {
        if (address?.country_code && typeof address.country_code === "string") {
            address.country_code = address.country_code.toLowerCase();
        }
    };

    normalizeAddress(body?.shipping_address);
    normalizeAddress(body?.billing_address);

    next();
}

function moveTokenToHeaderMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    if (req.query.token) {
        req.headers["x-modification-token"] = req.query.token as string;
        delete req.query.token;
    }
    next();
}

/**
 * Global Error Handler Middleware (Story 4.4)
 *
 * Captures unhandled errors to analytics and logs them.
 * Delegates to Medusa's default error handling for response.
 */
export function errorHandlerMiddleware(
    error: MedusaError | Error,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    // Extract context from request (with explicit type cast for user/customer)
    const { user, customer } = req as { user?: { id: string }; customer?: { id: string } };
    const context = {
        component: 'api',
        path: req.path,
        method: req.method,
        userId: user?.id || customer?.id,
    };

    // Log the error
    logger.error('api', `Unhandled error: ${error.message}`, context, error as Error);

    // Capture to analytics (async, don't await)
    void trackEvent(req.scope, "backend.error", {
        actorId: user?.id || customer?.id,
        properties: {
            component: context.component,
            path: context.path,
            method: context.method,
            error_name: error.name,
            error_message: error.message,
        },
    });

    // Return JSON error response for debugging
    const status = (error as any).status || (error as any).statusCode || 500;
    res.status(status).json({
        message: error.message,
        code: (error as any).code || 'INTERNAL_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
}

/**
 * Middleware configuration for custom API routes
 *
 * The Stripe webhook endpoint needs bodyParser disabled so we can
 * access the raw body for signature verification.
 */
export default defineMiddlewares({
    routes: [
        {
            // Disable body parsing for Stripe webhook to preserve raw body
            // This is required for Stripe signature verification
            matcher: "/webhooks/stripe",
            bodyParser: false,
        },
        {
            matcher: "/store/carts*",
            middlewares: [normalizeCartCountryCodesMiddleware],
        },
        {
            matcher: "/store/orders/:id*",
            middlewares: [moveTokenToHeaderMiddleware],
        },
        {
            // Story 1.7: Rate limiting for order edit endpoints
            matcher: /^\/store\/orders\/[^/]+\/(edit|cancel|address)$/,
            middlewares: [orderEditRateLimiter],
        },
    ],
    errorHandler: errorHandlerMiddleware,
});
