
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Stripe from "stripe";
import { getStripeClient } from "../../../utils/stripe";
import { queueStripeEvent, isEventProcessed } from "../../../lib/stripe-event-queue";

/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events by verifying the signature and 
 * queuing them for asynchronous processing.
 * 
 * Story 6.1: 
 * - AC 1-4: Signature Verification
 * - AC 5-7: Async Queueing (handled by worker)
 * - AC 8: Idempotency (checked here and in worker)
 * 
 * Endpoint: POST /webhooks/stripe
 */

/**
 * Helper to read raw body from request stream
 * Required because bodyParser is disabled for this route via middlewares.ts
 */
async function getRawBody(req: MedusaRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

/**
 * Check if an error indicates a duplicate job in BullMQ
 * Encapsulated to isolate brittle string matching and make updates easier
 * if BullMQ error messages change in future versions.
 */
function isDuplicateJobError(err: any, eventId: string): boolean {
    // Ideal: BullMQ provides a specific error class
    if (err?.name === "JobIdAlreadyExistsError") return true;
    
    const message = err?.message || "";
    return message.includes("already exists") || 
           (message.includes("Job") && message.includes(eventId));
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET is not configured");
        res.status(500).json({ error: "Webhook secret not configured" });
        return;
    }

    // Get the raw body for signature verification
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
        console.error("No Stripe signature found in request");
        res.status(400).json({ error: "No signature provided" });
        return;
    }

    let event: Stripe.Event;
    
    try {
        // Read the raw body from the request stream
        const rawBody = await getRawBody(req);

        // Verify the webhook signature
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Webhook signature verification failed: ${message}`);
        res.status(400).json({ error: `Webhook Error: ${message}` });
        return;
    }

    console.log(`Received Stripe webhook event: ${event.type} (${event.id})`);

    // Story 6.1 AC8: Idempotency check 
    // Rapid check to return 200 fast if we already know it's done
    // The queue logic also performs an atomic lock check
    const isProcessed = await isEventProcessed(event.id);
    if (isProcessed) {
        console.log(`[Webhook] Skipping duplicate event ${event.id}`);
        res.status(200).json({ received: true, duplicate: true });
        return;
    }

    // Queue the event for async processing
    // Story 6.1 AC 5-7: Async processing with retries
    try {
        await queueStripeEvent(event);
        console.log(`[Webhook] Queued event ${event.id}`);
    } catch (err: any) {
        // Check for duplicate job (already queued, being processed)
        if (isDuplicateJobError(err, event.id)) {
            console.log(`[Webhook] Event ${event.id} already queued (job exists), acknowledging`);
            res.status(200).json({ received: true, alreadyQueued: true });
            return;
        }

        // Log with correlation context for production debugging
        const errorContext = {
            eventId: event.id,
            eventType: event.type,
            errorName: err?.name,
            errorMessage: err?.message,
        };
        console.error(`[Webhook][CRITICAL] Failed to queue event:`, errorContext);
        
        // Return 500 to trigger Stripe retry (protects against infrastructure failures)
        res.status(500).json({ 
            error: "Internal Server Error",
            eventId: event.id, // Include for correlation in logs
        });
        return;
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
}

