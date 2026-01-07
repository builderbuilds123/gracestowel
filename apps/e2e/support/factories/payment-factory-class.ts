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
    const cartId = (overrides as any).cart_id;

    if (!cartId) {
      console.warn("Payment intent creation requires cart_id in Medusa v2.");
      return intent;
    }

    try {
      // 1. Create Payment Collection
      const pcResponse = await apiRequest<{ payment_collection: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/store/payment-collections",
        data: { cart_id: cartId },
      });
      const pcId = pcResponse.payment_collection.id;

      // 2. Create Payment Session
      const psResponse = await apiRequest<any>({
        request: this.request,
        method: "POST",
        url: `/store/payment-collections/${pcId}/payment-sessions`,
        data: { provider_id: "pp_system_default" },
      });

      const sessionId = psResponse.payment_collection?.payment_sessions?.[0]?.id || psResponse.id;
      if (sessionId) {
        this.createdPaymentIntentIds.push(pcId); // Use PC ID for cleanup if needed
        return { ...intent, id: sessionId, cart_id: cartId };
      }
    } catch (error) {
      console.error("Payment seeding failed:", error);
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
