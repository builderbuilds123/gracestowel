import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { captureAllOrderPayments } from "../../services/payment-capture-core";

type CapturePaymentStepInput = {
    orderId: string;
    paymentIntentId: string | null | undefined;
};

type CapturePaymentStepOutput = {
    success: boolean;
    skipped?: boolean;
    capturedCount?: number;
    skippedCount?: number;
};

export const capturePaymentStep = createStep(
    "capture-payment-step",
    async (input: CapturePaymentStepInput, { container }): Promise<StepResponse<CapturePaymentStepOutput>> => {
        const logger = container.resolve("logger");

        if (!input.orderId) {
            logger.info(`[capture-payment-step] Skipping capture: No order ID provided`);
            return new StepResponse({ success: true, skipped: true });
        }

        const idempotencyKey = `workflow_capture_${input.orderId}`;

        try {
            const result = await captureAllOrderPayments(
                container,
                input.orderId,
                idempotencyKey
            );

            if (!result.hasPayments) {
                logger.info(`[capture-payment-step] No payments found for order ${input.orderId}`);
                return new StepResponse({ success: true, skipped: true });
            }

            if (result.failedCount > 0) {
                throw new Error(`Failed to capture ${result.failedCount} payment(s): ${result.errors.join("; ")}`);
            }

            return new StepResponse({
                success: true,
                capturedCount: result.capturedCount,
                skippedCount: result.skippedCount,
            });
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[capture-payment-step] Payment Capture Failed: ${errMsg}`);
            throw new Error(`Payment Capture Failed: ${errMsg}`);
        }
    }
);
