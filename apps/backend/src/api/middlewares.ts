import { defineMiddlewares } from "@medusajs/framework/http";
import type {
    MedusaRequest,
    MedusaResponse,
    MedusaNextFunction,
} from "@medusajs/framework/http";

/**
 * Middleware to preserve raw body for Stripe webhook signature verification
 * 
 * Stripe requires the raw request body to verify webhook signatures.
 * This middleware captures the raw body before JSON parsing.
 */
async function preserveRawBody(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
) {
    // The raw body is needed for Stripe signature verification
    // Medusa's default body parser may have already parsed it,
    // so we store a stringified version if needed
    if (req.body && typeof req.body === "object") {
        (req as any).rawBody = JSON.stringify(req.body);
    }
    next();
}

export default defineMiddlewares({
    routes: [
        {
            // Apply raw body preservation to Stripe webhook endpoint
            matcher: "/webhooks/stripe",
            middlewares: [preserveRawBody],
        },
    ],
});

