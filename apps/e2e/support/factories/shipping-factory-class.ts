import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createShippingOption, ShippingOption } from "./shipping-factory";

export class ShippingFactory {
  private readonly createdShippingOptionIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createShippingOption(
    overrides: Partial<ShippingOption> = {},
  ): Promise<ShippingOption> {
    const shippingOption = createShippingOption(overrides);

    try {
      const created = await apiRequest<{ shipping_option?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/admin/shipping-options",
        data: shippingOption,
      });

      if (created.shipping_option?.id) {
        this.createdShippingOptionIds.push(created.shipping_option.id);
        return { ...shippingOption, id: created.shipping_option.id };
      }
    } catch (error) {
      console.warn("Shipping option seeding skipped; using generated data.");
    }

    return shippingOption;
  }

  async cleanup(): Promise<void> {
    for (const shippingOptionId of this.createdShippingOptionIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/admin/shipping-options/${shippingOptionId}`,
        });
      } catch (error) {
        console.warn(`Shipping option cleanup skipped for ${shippingOptionId}.`);
      }
    }
    this.createdShippingOptionIds.length = 0;
  }
}
