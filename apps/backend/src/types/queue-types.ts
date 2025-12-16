/**
 * Shared types for BullMQ queues and workers
 * 
 * These types are used by both queue files (lib/) and worker files (workers/)
 * to avoid circular dependencies.
 */

import Stripe from "stripe";

// ============================================
// Payment Capture Types
// ============================================

/**
 * Payment capture job data
 */
export interface PaymentCaptureJobData {
  orderId: string;
  paymentIntentId: string;
  scheduledAt: number;
  source?: "normal" | "fallback" | "redis_recovery";
}

/**
 * Story 3.4: Type-safe error for job active state
 * Thrown when attempting to cancel a job that is currently being processed
 */
export class JobActiveError extends Error {
  public readonly code = "JOB_ACTIVE";
  
  constructor(orderId: string) {
    super(`Cannot cancel capture job for ${orderId}: Job is active/processing`);
    this.name = "JobActiveError";
  }
}

// ============================================
// Stripe Event Types
// ============================================

/**
 * Stripe event job data for webhook processing
 */
export interface StripeEventJobData {
  eventId: string;
  eventType: string;
  eventData: Stripe.Event;
  receivedAt: number;
}

// ============================================
// Email Types (re-export for consistency)
// ============================================

// Email types are defined in lib/email-queue.ts
// They're simple enough that we don't need to move them here
