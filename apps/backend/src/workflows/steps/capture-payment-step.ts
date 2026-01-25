/**
 * Step: Capture Payment
 * 
 * Executes payment capture using the shared core logic.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { executePaymentCapture } from "../../services/payment-capture-core";

type CapturePaymentStepInput = {
    orderId: string;
    paymentIntentId: string | null | undefined;
};

export const capturePaymentStep = createStep(
    "capture-payment-step",
    async (input: CapturePaymentStepInput, { container }) => {
        const logger = container.resolve("logger");

        if (!input.paymentIntentId) {
            logger.info("capture-payment-step", "Skipping capture: No Payment Intent ID provided", { orderId: input.orderId });
            return new StepResponse({ success: true, skipped: true });
        }
        
        // Idempotency key for this specific workflow run
        // We use orderId + pi_id as base, but maybe add a suffix if we want to distinguish attempts?
        // Actually, Stripe requires same key for retries.
        const idempotencyKey = `workflow_capture_${input.orderId}_${input.paymentIntentId}`;

        try {
            await executePaymentCapture(
                container,
                input.orderId,
                input.paymentIntentId,
                idempotencyKey
            );
            
            return new StepResponse({ success: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Re-throw to trigger Workflow Rollback (which calls cancelFulfillment compensation)
            throw new Error(`Payment Capture Failed: ${errorMessage}`);
        }
    }
    // Compensation:
    // If THIS step fails, it throws immediately.
    // The previous steps (Cancel Job, Create Fulfillment) will have their compensations triggered.
    // This step itself produces no side effects that need to be undone if IT fails 
    // (since it failed, it didn't capture).
    // If it SUCCEEDED, and a LATER step failed, we might need refund?
    // But this is the LAST step. So no compensation needed.
);
