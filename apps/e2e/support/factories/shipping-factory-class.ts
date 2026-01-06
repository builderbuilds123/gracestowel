import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { createShippingOption, ShippingOption } from "./shipping-factory";

export class ShippingFactory {
  private readonly createdShippingOptionIds: string[] = [];
  private cachedServiceZoneId: string | null = null;
  private cachedShippingProfileId: string | null = null;

  constructor(private readonly request: APIRequestContext) {}

  /**
   * Fetches the first available service zone ID from the backend.
   * Service zones are created during seed and are required for shipping options.
   */
  private async getServiceZoneId(): Promise<string> {
    if (this.cachedServiceZoneId) return this.cachedServiceZoneId;

    // First get fulfillment sets which contain service zones
    const fulfillmentSets = await apiRequest<{ fulfillment_sets: { id: string; service_zones?: { id: string }[] }[] }>({
      request: this.request,
      method: "GET",
      url: "/admin/fulfillment-sets",
    });

    const serviceZone = fulfillmentSets.fulfillment_sets?.[0]?.service_zones?.[0];
    if (!serviceZone?.id) {
      throw new Error("No service zone found. Ensure the backend is seeded with fulfillment data.");
    }

    this.cachedServiceZoneId = serviceZone.id;
    return serviceZone.id;
  }

  /**
   * Fetches the default shipping profile ID from the backend.
   * Shipping profiles are created during seed and are required for shipping options.
   */
  private async getShippingProfileId(): Promise<string> {
    if (this.cachedShippingProfileId) return this.cachedShippingProfileId;

    const profiles = await apiRequest<{ shipping_profiles: { id: string; type: string }[] }>({
      request: this.request,
      method: "GET",
      url: "/admin/shipping-profiles",
    });

    const defaultProfile = profiles.shipping_profiles?.find(p => p.type === "default") || profiles.shipping_profiles?.[0];
    if (!defaultProfile?.id) {
      throw new Error("No shipping profile found. Ensure the backend is seeded with fulfillment data.");
    }

    this.cachedShippingProfileId = defaultProfile.id;
    return defaultProfile.id;
  }

  async createShippingOption(
    overrides: Partial<ShippingOption> & { region_id?: string } = {},
  ): Promise<ShippingOption> {
    const shippingOption = createShippingOption(overrides);
    const regionId = overrides.region_id;

    // Fetch real IDs from the backend if not provided
    const serviceZoneId = (shippingOption as any).service_zone_id || await this.getServiceZoneId();
    const shippingProfileId = (shippingOption as any).shipping_profile_id || await this.getShippingProfileId();

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
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfileId,
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

