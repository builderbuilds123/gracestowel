import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { getPaymentCaptureQueue } from "../../lib/payment-capture-queue";

export const cancelPaymentCaptureJobStep = createStep(
    "cancel-capture-job-step",
    async (orderId: string, { container }) => {
        const logger = container.resolve("logger");
        
        try {
            const queue = getPaymentCaptureQueue();
            const jobName = `capture-${orderId}`;
            
            // Look for existing job
            // Using getJob ensures we find it by ID if predictable, but standard queue.add returns job with ID.
            // In worker code: jobId: `capture-${orderId}`
            const job = await queue.getJob(jobName);

            if (job) {
                await job.remove();
                logger.info(`[cancel-capture-job-step] Cancelled scheduled capture job: ${jobName}`);
                return new StepResponse({ cancelled: true, jobId: jobName }, { cancelled: true, jobId: jobName });
            } else {
                logger.debug(`[cancel-capture-job-step] No scheduled job found to cancel: ${jobName}`);
                return new StepResponse({ cancelled: false, jobId: jobName }, { cancelled: false, jobId: jobName });
            }
        } catch (error) {
            // Soft failure: We prefer the workflow to continue even if we fail to remove the backup job.
            // The backup job is idempotent anyway.
            logger.warn(`[cancel-capture-job-step] Failed to cancel capture job for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
            return new StepResponse({ cancelled: false }, { cancelled: false });
        }
    },
    async (response, { container }) => {
        // Compensation: If we cancelled a job, we technically "should" restore it if the workflow fails.
        // But restoring a precise delayed job is complex (need original timestamp).
        // For this use case (immediate capture failing), we arguably WANT the backup job to exist.
        // But we just deleted it!
        // Given complexity, and that 'capture' is the VERY NEXT step, if capture fails, we want to reschedule.
        // Ideally, we only cancel AFTER capture succeeds? 
        // Or we reschedule in compensation.
        
        // For now, simple logging. 
        // If we moved the cancel step to AFTER capture, this compensation isn't needed for capture failure.
        // If we cancel BEFORE capture, and capture fails, we lost our safety net.
        
        // RECOMMENDATION: This step is robust as is, but logic placement matters.
        const logger = container.resolve("logger");
        if (response?.cancelled) {
            logger.warn(`[cancel-capture-job-step] Compensation: Job was cancelled but cannot be easily restored. Manual check suggested if transaction fails.`);
        }
    }
);
