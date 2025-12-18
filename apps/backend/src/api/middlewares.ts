import {
    defineMiddlewares,
    MedusaNextFunction,
    type MedusaRequest,
    type MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { captureBackendError } from "../utils/posthog";
import { logger } from "../utils/logger";

// Subscriber registration flag
let subscribersRegistered = false;

/**
 * Subscriber Registration Middleware
 *
 * Registers all project subscribers on first API request.
 * This is a workaround for Medusa v2 not auto-discovering project subscribers.
 */
async function registerSubscribersMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    // Run subscriber registration asynchronously but don't block request
    if (!subscribersRegistered) {
        subscribersRegistered = true; // Set immediately to prevent duplicate attempts

        // Register subscribers in background
        setImmediate(async () => {
            try {
                console.log("[SubscriberMiddleware] Registering project subscribers...");
                const eventBusModuleService = req.scope.resolve(Modules.EVENT_BUS);

                // Use require for CommonJS compatibility
                const orderPlacedModule = require("../subscribers/order-placed");
                const customerCreatedModule = require("../subscribers/customer-created");
                const fulfillmentCreatedModule = require("../subscribers/fulfillment-created");
                const orderCanceledModule = require("../subscribers/order-canceled");

                const subscribers = [
                    { module: orderPlacedModule, name: "order-placed" },
                    { module: customerCreatedModule, name: "customer-created" },
                    { module: fulfillmentCreatedModule, name: "fulfillment-created" },
                    { module: orderCanceledModule, name: "order-canceled" },
                ];

                // Register each subscriber
                for (const { module, name } of subscribers) {
                    eventBusModuleService.subscribe(module.config.event, async (data: any) => {
                        await module.default({
                            event: { name: module.config.event, data },
                            container: req.scope
                        });
                    });
                    console.log(`[SubscriberMiddleware] ✅ Registered: ${module.config.event} (${name})`);
                }

                console.log(`[SubscriberMiddleware] Successfully registered ${subscribers.length} subscribers`);
            } catch (error) {
                console.error("[SubscriberMiddleware] Failed to register subscribers:", error);
                subscribersRegistered = false; // Reset on failure to allow retry
            }
        });
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
        {
            // Register subscribers on all routes (runs once on first request)
            matcher: "*",
            middlewares: [registerSubscribersMiddleware],
        },
    ],
    errorHandler: errorHandlerMiddleware,
});

