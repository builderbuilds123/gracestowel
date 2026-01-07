import {
    defineMiddlewares,
    MedusaNextFunction,
    type MedusaRequest,
    type MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { captureBackendError } from "../utils/posthog";
import { logger } from "../utils/logger";
import { registerProjectSubscribers } from "../utils/register-subscribers";

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
 * Captures unhandled errors to PostHog and logs them.
 * Delegates to Medusa's default error handling for response.
 */
function errorHandlerMiddleware(
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

    // Capture to PostHog (async, don't await)
    captureBackendError(error as Error, context);

    // Return JSON error response for debugging
    const status = (error as any).status || (error as any).statusCode || 500;
    res.status(status).json({
        message: error.message,
        code: (error as any).code || 'INTERNAL_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
}

/**
 * Global Subscriber Registration Middleware
 *
 * Ensures project subscribers are registered on first API request
 * Medusa v2 doesn't auto-discover project-level subscribers, so we register manually
 */
async function registerSubscribersMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    // Register subscribers using the request's container scope
    // This ensures all scopes share the same event bus (via Redis)
    try {
        await registerProjectSubscribers(req.scope);
    } catch (error) {
        logger.error("middleware", "Failed to register subscribers", {}, error as Error);
    }
    next();
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
            // Global middleware to register subscribers on first request
            matcher: "*",
            middlewares: [registerSubscribersMiddleware],
        },
    ],
    errorHandler: errorHandlerMiddleware,
});

