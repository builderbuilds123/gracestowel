import { 
    defineMiddlewares, 
    MedusaNextFunction,
    type MedusaRequest, 
    type MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { captureBackendError } from "../utils/posthog";
import { logger } from "../utils/logger";

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
    // Extract context from request
    const context = {
        component: 'api',
        path: req.path,
        method: req.method,
        userId: (req as any).user?.id || (req as any).customer?.id,
    };

    // Log the error
    logger.error('api', `Unhandled error: ${error.message}`, context, error as Error);

    // Capture to PostHog (async, don't await)
    captureBackendError(error as Error, context);

    // Let Medusa handle the response
    // Pass to next error handler (Medusa's default)
    next(error);
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
    ],
    errorHandler: errorHandlerMiddleware,
});

