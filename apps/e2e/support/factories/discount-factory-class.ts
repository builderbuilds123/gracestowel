import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createDiscount, Discount } from "./discount-factory";

/**
 * DiscountFactory using Medusa v2 Promotions API
 */
export class DiscountFactory {
  private readonly createdPromotionIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createDiscount(overrides: Partial<Discount> = {}): Promise<Discount> {
    const promotion = createDiscount(overrides);

    try {
      const created = await apiRequest<{ promotion?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/admin/promotions",
        data: {
          code: promotion.code,
          type: promotion.type,
          status: promotion.status,
          is_automatic: promotion.is_automatic,
          application_method: promotion.application_method,
          // Only send rules if they exist to avoid strict validation issues
          ...(promotion.rules ? { rules: promotion.rules } : {}),
        },
      });

      if (created.promotion?.id) {
        this.createdPromotionIds.push(created.promotion.id);
        return { ...promotion, id: created.promotion.id };
      }
    } catch (error: any) {
      console.error("Promotion seeding failed:", JSON.stringify(error.body || error.message, null, 2));
      console.warn("Promotion seeding skipped; using generated data.");
    }

    return promotion;
  }

  async cleanup(): Promise<void> {
    for (const promotionId of this.createdPromotionIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/admin/promotions/${promotionId}`,
        });
      } catch (error) {
        console.warn(`Promotion cleanup skipped for ${promotionId}.`);
      }
    }
    this.createdPromotionIds.length = 0;
  }
}
