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
            logger.info(`[capture-payment-step] Skipping capture: No Payment Intent ID provided for order ${input.orderId}`);
            return new StepResponse({ success: true, skipped: true });
        }
        
        // Idempotency key for this specific workflow run
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
            // Re-throw to trigger workflow rollback
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[capture-payment-step] Payment Capture Failed: ${errMsg}`);
            throw new Error(`Payment Capture Failed: ${errMsg}`);
        }
    }
);
