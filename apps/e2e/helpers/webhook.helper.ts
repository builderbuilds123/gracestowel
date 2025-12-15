import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2024-12-18.acacia', // Using latest API version or pinned one
  typescript: true,
});

export class WebhookHelper {
  private stripe: Stripe;
  private backendUrl: string;
  private webhookSecret: string;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
       apiVersion: '2024-12-18.acacia',
       typescript: true,
    });
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:9000';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';
  }

  async simulateWebhook(
    eventType: string,
    payload: object,
    options?: { delay?: number }
  ): Promise<Response> {
    if (options?.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }

    const event = {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2024-12-18.acacia',
      created: Math.floor(Date.now() / 1000),
      type: eventType,
      data: {
        object: payload
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: `req_test_${Date.now()}`,
        idempotency_key: `ikey_test_${Date.now()}`
      }
    };

    const payloadString = JSON.stringify(event);
    const signature = await this.createStripeSignature(payloadString, this.webhookSecret);

    return fetch(`${this.backendUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature
      },
      body: payloadString
    });
  }

  async createStripeSignature(
    payload: string,
    secret: string
  ): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;

    // In a real environment, we would use crypto to sign.
    // However, in browser/test environment we might need to rely on Stripe library or a simple mock if we are not testing signature verification logic on the server strictly with this helper,
    // BUT the requirement says "valid Stripe signature".
    // Since this runs in Node (Playwright test runner), we can use 'crypto'.

    // NOTE: The stripe library has webhooks.generateTestHeaderString but it requires the raw event object usually.
    // Let's use crypto manually to be safe and explicit.

    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const signature = hmac.digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  async mockPaymentIntentAuthorized(
    paymentIntentId: string,
    amount: number,
    metadata?: Record<string, string>
  ): Promise<Response> {
    const payload = {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: amount,
      currency: 'usd',
      status: 'requires_capture',
      metadata: metadata || {},
      // Add other necessary fields as needed
    };

    return this.simulateWebhook('payment_intent.amount_capturable_updated', payload);
  }

   async mockPaymentIntentCaptured(
    paymentIntentId: string
  ): Promise<Response> {
    const payload = {
      id: paymentIntentId,
      object: 'payment_intent',
      status: 'succeeded',
    };
    return this.simulateWebhook('payment_intent.succeeded', payload);
  }

  async mockPaymentIntentFailed(
    paymentIntentId: string,
    error: string
  ): Promise<Response> {
     const payload = {
      id: paymentIntentId,
      object: 'payment_intent',
      status: 'requires_payment_method',
      last_payment_error: {
        message: error
      }
    };
    return this.simulateWebhook('payment_intent.payment_failed', payload);
  }
}
