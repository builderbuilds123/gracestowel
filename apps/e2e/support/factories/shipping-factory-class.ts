import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createShippingOption, ShippingOption } from "./shipping-factory";

export class ShippingFactory {
  private readonly createdShippingOptionIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createShippingOption(
    overrides: Partial<ShippingOption> & { region_id?: string } = {},
  ): Promise<ShippingOption> {
    const shippingOption = createShippingOption(overrides);
    const regionId = overrides.region_id;

    const response = await apiRequest<{ shipping_option: { id: string } }>({
      request: this.request,
      method: "POST",
      url: "/admin/shipping-options",
      data: {
        name: shippingOption.name,
        price_type: shippingOption.price_type || "flat",
        type: {
          label: "Standard",
          description: "Standard shipping",
          code: "standard-" + Math.random().toString(36).substring(7),
        },
        prices: [
          {
            amount: shippingOption.amount || 1000,
            ...(regionId ? { region_id: regionId } : { currency_code: "usd" }),
          },
          // Add a fallback price if regionId is provided
          ...(regionId ? [
            {
              amount: shippingOption.amount || 1200,
              currency_code: "usd",
            }
          ] : [
            {
              amount: shippingOption.amount || 1200,
              currency_code: "cad",
            }
          ]),
        ],
        service_zone_id: (shippingOption as any).service_zone_id || "serzo_01KCQ89AQX5KAJSGY0GATGAS4C",
        shipping_profile_id: (shippingOption as any).shipping_profile_id || "sp_01KCQ8965R066RVNKFRA5Z42D6",
        provider_id: (shippingOption as any).provider_id || "manual_manual",
      },
    });

    const created = response.shipping_option;
    if (!created?.id) {
      throw new Error(`Failed to create shipping option: ${JSON.stringify(response)}`);
    }

    this.createdShippingOptionIds.push(created.id);
    return { ...shippingOption, id: created.id };
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
