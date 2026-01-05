import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createPaymentIntent, PaymentIntent } from "./payment-factory";

export class PaymentFactory {
  private readonly createdPaymentIntentIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createPaymentIntent(
    overrides: Partial<PaymentIntent> = {},
  ): Promise<PaymentIntent> {
    const intent = createPaymentIntent(overrides);

    try {
      const created = await apiRequest<{ payment_intent?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/admin/payment-intents",
        data: intent,
      });

      if (created.payment_intent?.id) {
        this.createdPaymentIntentIds.push(created.payment_intent.id);
        return { ...intent, id: created.payment_intent.id };
      }
    } catch (error) {
      console.warn("Payment intent seeding skipped; using generated data.");
    }

    return intent;
  }

  async cleanup(): Promise<void> {
    for (const intentId of this.createdPaymentIntentIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/admin/payment-intents/${intentId}`,
        });
      } catch (error) {
        console.warn(`Payment intent cleanup skipped for ${intentId}.`);
      }
    }
    this.createdPaymentIntentIds.length = 0;
  }
}
