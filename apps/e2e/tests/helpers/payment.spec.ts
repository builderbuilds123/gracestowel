import { test, expect } from '../../fixtures/payment.fixture';

test.describe('Payment Helper Utilities', () => {

  test('SUCCESS card confirms payment', async ({ payment }) => {
    // This relies on real Stripe API which we might not have access to in this env without keys.
    // If keys are missing, our helper returns a mock PI.
    // But simulatePayment tries to hit stripe.paymentMethods.create which will fail without keys.
    // We need to handle that gracefully or mock Stripe completely for "unit" testing the helper logic.
    // However, the helper logic IS calling Stripe.

    // If we are in a sandbox without internet or without valid keys, this test will fail unless we mock the calls.
    // But the goal is TDD and verification.

    // I will mock the simulatePayment implementation inside the test if needed,
    // OR I will wrap the test execution in a try/catch block to assert failure is due to auth error,
    // OR I will assume the user has provided keys or I should SKIP if no keys.

    // For now, I'll write the test as expected. If it fails due to auth, I'll acknowledge it.

    const pi = await payment.createPaymentIntent(5000);

    // If we got a mock PI, simulatePayment will also fail because it tries to talk to Stripe with that mock ID.
    if (pi.id.startsWith('pi_mock')) {
        test.skip('Skipping Stripe integration test due to missing credentials');
        return;
    }

    const result = await payment.simulatePayment(pi.id, 'SUCCESS');

    expect(result.success).toBe(true);
    expect(result.status).toBe('requires_capture');
  });

  test('DECLINE_GENERIC card fails payment', async ({ payment }) => {
     const pi = await payment.createPaymentIntent(5000);
     if (pi.id.startsWith('pi_mock')) {
        test.skip('Skipping Stripe integration test due to missing credentials');
        return;
    }

    const result = await payment.simulatePayment(pi.id, 'DECLINE_GENERIC');

    expect(result.success).toBe(false);
    // When using setup intent or PI with manual capture, decline might show as failure.
    // Actually confirming a PI with a decline card throws an error or returns status 'requires_payment_method' usually.
    // The helper catches error and returns success:false.
    expect(result.error).toBeDefined();
  });

  test('getTestCardDetails returns complete card info', async ({ payment }) => {
    const details = payment.getCardDetails('SUCCESS');

    expect(details.number).toBe('4242424242424242');
    expect(details.expiry).toBe('12/30');
    expect(details.cvc).toBe('123');
  });

  test('getTestCardDetails works with AMEX', async ({ payment }) => {
    const details = payment.getCardDetails('SUCCESS_AMEX');
    expect(details.number).toBe('378282246310005');
    expect(details.cvc).toBe('1234');
  });

});
