/**
 * Step: Cancel Payment Capture Job
 * 
 * Cancels the scheduled BullMQ job for payment capture (3-day fallback).
 * Used when fulfillment triggers immediate capture.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { getPaymentCaptureQueue } from "../../lib/payment-capture-queue";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export const cancelPaymentCaptureJobStep = createStep(
    "cancel-payment-capture-job",
    async (orderId: string, { container }) => {
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
        const jobId = `capture-${orderId}`;

        try {
            const queue = getPaymentCaptureQueue();
            const job = await queue.getJob(jobId);

            if (job) {
                await job.remove();
                logger.info("cancel-capture-job-step", "Cancelled scheduled capture job", { jobId });
                return new StepResponse({ cancelled: true, jobId });
            } else {
                logger.debug("cancel-capture-job-step", "Job not found (already executed or never scheduled)", { jobId });
                return new StepResponse({ cancelled: false, jobId });
            }
        } catch (error) {
            // Soft failure: If we can't cancel the job, log it but don't fail the workflow.
            // The job has idempotency checks/locking so it won't double capture.
            logger.warn("cancel-capture-job-step", "Failed to cancel capture job", { 
                jobId,
                error: error instanceof Error ? error.message : String(error)
            });
            return new StepResponse({ cancelled: false, error: String(error) });
        }
    },
    // Compensation: Re-schedule the job?
    // If the workflow fails later (e.g. capture fails), we should ideally restore the fallback job.
    // However, recreating the exact job (same delay) is complex.
    // Since we also have the "Fallback Cron" (safety net), it's acceptable to NOT restore the specific 3-day job,
    // because the hourly fallback will catch it eventually if it remains uncaptured.
    // So compensation is a no-op for now.
    async (data, { container }) => {
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
        if (data?.cancelled) {
            logger.info("cancel-capture-job-step", "Compensation: Job was cancelled, relying on Fallback Cron for safety", { jobId: data.jobId });
        }
    }
);
