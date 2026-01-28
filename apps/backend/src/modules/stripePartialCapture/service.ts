/**
 * Custom Stripe Payment Provider with Partial Capture Support
 *
 * Extends the default Stripe provider to support `amount_to_capture`
 * for partial captures on decreased-quantity orders.
 *
 * The default Medusa Stripe provider calls `stripe.paymentIntents.capture(id)`
 * without `amount_to_capture`, always capturing the full authorized amount.
 * This override reads `amount_to_capture` from `payment.data` (set by
 * payment-capture-core.ts before invoking the workflow) and passes it to Stripe.
 */

import StripeBase from "@medusajs/payment-stripe/dist/core/stripe-base"
import type Stripe from "stripe"
import type {
    CapturePaymentInput,
    CapturePaymentOutput,
} from "@medusajs/framework/types"
import type { PaymentIntentOptions } from "@medusajs/payment-stripe/dist/types"

class StripePartialCaptureService extends StripeBase {
    // Must match the default "stripe" identifier so existing payment sessions,
    // regions, and DB records continue to work without migration.
    static identifier = "stripe"

    get paymentIntentOptions(): PaymentIntentOptions {
        // Same as default StripeProviderService — empty object
        // means capture_method comes from StripeBase's initiatePayment logic
        return {}
    }

    async capturePayment(
        { data, context }: CapturePaymentInput
    ): Promise<CapturePaymentOutput> {
        const id = data?.id as string
        const amountToCapture = data?.amount_to_capture as number | undefined

        try {
            // Stripe SDK: capture(id, params?, options?)
            // - params: { amount_to_capture } for partial captures
            // - options: { idempotencyKey } for deduplication
            const params: Stripe.PaymentIntentCaptureParams = {}
            const options: Stripe.RequestOptions = {}

            if (context?.idempotency_key) {
                options.idempotencyKey = context.idempotency_key
            }

            // Key enhancement: pass amount_to_capture for partial captures
            if (amountToCapture !== undefined && amountToCapture > 0) {
                params.amount_to_capture = amountToCapture
            }

            const intent = await this.stripe_.paymentIntents.capture(
                id,
                params,
                options
            )
            return { data: intent as unknown as Record<string, unknown> }
        } catch (error: unknown) {
            // Handle already-succeeded PI (same as base class)
            const stripeError = error as {
                code?: string
                payment_intent?: { status?: string }
            }
            if (stripeError.code === "payment_intent_unexpected_state") {
                if (stripeError.payment_intent?.status === "succeeded") {
                    return { data: stripeError.payment_intent as unknown as Record<string, unknown> }
                }
            }
            throw this.buildError(
                "An error occurred in capturePayment",
                error as Error
            )
        }
    }
}

export default StripePartialCaptureService
