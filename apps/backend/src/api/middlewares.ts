import {
    defineMiddlewares,
    MedusaNextFunction,
    type MedusaRequest,
    type MedusaResponse,
    authenticate,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { trackEvent } from "../utils/analytics";
import { logger } from "../utils/logger";
import { orderEditRateLimiter } from "../utils/rate-limiter";

interface Address {
    country_code?: string;
    [key: string]: unknown;
}

interface RequestBody {
    shipping_address?: Address;
    billing_address?: Address;
    [key: string]: unknown;
}

function normalizeCartCountryCodesMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    const body = req.body as RequestBody | undefined;

    const normalizeAddress = (address: Address | undefined): void => {
        if (address?.country_code && typeof address.country_code === "string") {
            address.country_code = address.country_code.toLowerCase();
        }
    };

    if (body) {
        normalizeAddress(body.shipping_address);
        normalizeAddress(body.billing_address);
    }

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
    // MedusaError has status and code properties, but Error doesn't
    interface ErrorWithStatus extends Error {
        status?: number;
        statusCode?: number;
        code?: string;
    }
    
    const errorWithStatus = error as ErrorWithStatus;
    const status = errorWithStatus.status || errorWithStatus.statusCode || 500;
    const code = errorWithStatus.code || (error instanceof MedusaError ? error.type : 'INTERNAL_ERROR');
    
    res.status(status).json({
        message: error.message,
        code,
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
            // Admin routes require authentication
            matcher: "/admin/*",
            middlewares: [
                authenticate("user", ["session", "bearer", "api-key"]),
            ],
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
            // Includes eligibility endpoint to prevent enumeration attacks
            matcher: /^\/store\/orders\/[^/]+\/(edit|cancel|address|eligibility)$/,
            middlewares: [orderEditRateLimiter],
        },
        {
            // Story 2.2: Allow both authenticated customers and guests with tokens
            // This allows customer sessions OR guest tokens (via x-modification-token header)
            matcher: /^\/store\/orders\/[^/]+$/,
            middlewares: [
                authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
            ],
        },
    ],
    errorHandler: errorHandlerMiddleware,
});
