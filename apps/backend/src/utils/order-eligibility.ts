/**
 * Order Edit Eligibility Check
 * 
 * Story 1.4: Validate order eligibility for editing
 * Checks fulfillment status and payment status before allowing edits.
 */

import Stripe from "stripe";
import { logger } from "../utils/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

export type EligibilityErrorCode =
  | "ORDER_FULFILLED"
  | "PAYMENT_CAPTURED"
  | "PAYMENT_AUTH_INVALID"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_STATUS_INVALID";

export interface EligibilityResult {
  eligible: boolean;
  errorCode?: EligibilityErrorCode;
  debugContext?: Record<string, unknown>; // For logging only, never sent to client
}

const BLOCKED_FULFILLMENT_STATUSES = [
  "fulfilled",
  "partially_fulfilled",
  "shipped",
  "partially_shipped",
  "delivered",
  "partially_delivered",
];

export async function checkOrderEditEligibility(
  order: {
    id: string;
    fulfillment_status: string;
    created_at: string | Date;
    payment_collections?: Array<{
      payments?: Array<{
        data?: { id?: string };
        captured_at?: string | Date | null;
      }>;
    }>;
  }
): Promise<EligibilityResult> {
  // Check 1: Fulfillment status
  if (BLOCKED_FULFILLMENT_STATUSES.includes(order.fulfillment_status)) {
    return {
      eligible: false,
      errorCode: "ORDER_FULFILLED",
      debugContext: { fulfillmentStatus: order.fulfillment_status },
    };
  }

  // Check 2: Payment status
  const paymentIntentId = order.payment_collections?.[0]?.payments?.[0]?.data?.id;

  if (!paymentIntentId) {
    return {
      eligible: false,
      errorCode: "PAYMENT_NOT_FOUND",
      debugContext: { hasPaymentCollections: !!order.payment_collections?.length },
    };
  }

  // Check if already captured locally (Medusa payment record)
  const payment = order.payment_collections?.[0]?.payments?.[0];
  if (payment?.captured_at) {
    return {
      eligible: false,
      errorCode: "PAYMENT_CAPTURED",
      debugContext: { capturedAt: payment.captured_at },
    };
  }

  // Check Stripe PaymentIntent status
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string);

    if (paymentIntent.status === "requires_capture") {
      return { eligible: true };
    }

    if (paymentIntent.status === "succeeded") {
      return {
        eligible: false,
        errorCode: "PAYMENT_CAPTURED",
        debugContext: { paymentStatus: paymentIntent.status },
      };
    }

    if (paymentIntent.status === "canceled") {
      return {
        eligible: false,
        errorCode: "PAYMENT_AUTH_INVALID",
        debugContext: {
          paymentStatus: paymentIntent.status,
          daysSinceOrder: Math.floor(
            (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
      };
    }

    return {
      eligible: false,
      errorCode: "PAYMENT_STATUS_INVALID",
      debugContext: { paymentStatus: paymentIntent.status },
    };
  } catch (error) {
    logger.error("order-eligibility", "Failed to retrieve PaymentIntent", {
      orderId: order.id,
      paymentIntentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      eligible: false,
      errorCode: "PAYMENT_NOT_FOUND",
      debugContext: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}
