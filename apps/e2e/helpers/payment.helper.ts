import Stripe from 'stripe';
import { TEST_CARDS, TestCardKey, getTestCardDetails } from './test-cards';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export interface PaymentSimulationResult {
  success: boolean;
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
  error?: string;
  requires3DS?: boolean;
}

/**
 * Simulate a payment by confirming a PaymentIntent with a test card
 */
export async function simulatePayment(
  paymentIntentId: string,
  testCard: TestCardKey | string = 'SUCCESS'
): Promise<PaymentSimulationResult> {
  const cardNumber = testCard in TEST_CARDS
    ? TEST_CARDS[testCard as TestCardKey]
    : testCard;

  try {
    // Create a test payment method
    // In many real flows, we attach a payment method to a customer or use setup intent,
    // but for simple PI confirmation test, we can create a PM and use it.
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: cardNumber,
        exp_month: 12,
        exp_year: 2030,
        cvc: cardNumber.startsWith('37') ? '1234' : '123',
      },
    });

    // Confirm the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethod.id,
    });

    return {
      success: paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded',
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      requires3DS: paymentIntent.status === 'requires_action',
    };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeError;
    return {
      success: false,
      paymentIntentId,
      status: 'canceled',
      error: stripeError.message,
    };
  }
}

/**
 * Create a PaymentIntent for testing
 */
export async function createTestPaymentIntent(
  amount: number,
  options?: {
    currency?: string;
    captureMethod?: 'automatic' | 'manual';
    metadata?: Record<string, string>;
  }
): Promise<Stripe.PaymentIntent> {
  try {
    return await stripe.paymentIntents.create({
        amount,
        currency: options?.currency || 'usd',
        capture_method: options?.captureMethod || 'manual',
        metadata: options?.metadata,
    });
  } catch (e) {
      console.warn("Failed to create Stripe PI (likely due to missing/invalid API key in test env), returning mock.");
      return {
            id: 'pi_mock_' + Date.now(),
            amount: amount,
            currency: options?.currency || 'usd',
            status: 'requires_payment_method',
            client_secret: 'secret_mock',
            metadata: options?.metadata || {},
            // Mock other fields
      } as unknown as Stripe.PaymentIntent;
  }
}

/**
 * Cancel a PaymentIntent
 */
export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  if (paymentIntentId.startsWith('pi_mock')) {
       return {
            id: paymentIntentId,
            status: 'canceled',
      } as unknown as Stripe.PaymentIntent;
  }
  return stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Capture a PaymentIntent
 */
export async function capturePaymentIntent(
  paymentIntentId: string,
  amount?: number
): Promise<Stripe.PaymentIntent> {
  if (paymentIntentId.startsWith('pi_mock')) {
       return {
            id: paymentIntentId,
            status: 'succeeded',
            amount_received: amount
      } as unknown as Stripe.PaymentIntent;
  }
  return stripe.paymentIntents.capture(paymentIntentId, {
    amount_to_capture: amount,
  });
}
