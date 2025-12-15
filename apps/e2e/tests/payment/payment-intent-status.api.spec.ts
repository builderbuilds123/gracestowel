import { test, expect } from '../../fixtures';

test.describe('PaymentIntent Status Transitions', () => {
  test('should create PaymentIntent in requires_payment_method status', async ({ payment }) => {
    // This uses helper which mocks or hits Stripe.
    const pi = await payment.createPaymentIntent(5000);

    // In Mock, status is 'requires_payment_method'.
    // In Stripe, creating a PI without PM usually results in 'requires_payment_method'.
    expect(pi.status).toBe('requires_payment_method');
  });

  test('should transition to requires_capture after confirmation', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(5000, {
      captureMethod: 'manual'
    });

    // If mock, it returns mocked object.
    if (pi.id.startsWith('pi_mock')) {
         // simulatePayment also mocks success.
    }

    const result = await payment.simulatePayment(pi.id, 'SUCCESS');

    expect(result.success).toBe(true);
    expect(result.status).toBe('requires_capture');
  });

  test('should handle declined payment', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(5000);

    const result = await payment.simulatePayment(pi.id, 'DECLINE_GENERIC');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
