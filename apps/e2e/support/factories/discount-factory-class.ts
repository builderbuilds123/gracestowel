import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createDiscount, Discount } from "./discount-factory";

export class DiscountFactory {
  private readonly createdDiscountIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createDiscount(overrides: Partial<Discount> = {}): Promise<Discount> {
    const discount = createDiscount(overrides);

    try {
      const created = await apiRequest<{ discount?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/admin/discounts",
        data: {
          code: discount.code,
          is_dynamic: discount.is_dynamic,
          is_disabled: discount.is_disabled,
          starts_at: discount.starts_at,
          ends_at: discount.ends_at,
          rule: discount.rule,
        },
      });

      if (created.discount?.id) {
        this.createdDiscountIds.push(created.discount.id);
        return { ...discount, id: created.discount.id };
      }
    } catch (error) {
      console.warn("Discount seeding skipped; using generated data.");
    }

    return discount;
  }

  async cleanup(): Promise<void> {
    for (const discountId of this.createdDiscountIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/admin/discounts/${discountId}`,
        });
      } catch (error) {
        console.warn(`Discount cleanup skipped for ${discountId}.`);
      }
    }
    this.createdDiscountIds.length = 0;
  }
}
