import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { ShippingOption } from "./shipping-factory";

export class ShippingFactory {
  private readonly createdShippingOptionIds: string[] = [];
  private cachedShippingOptions: ShippingOption[] | null = null;

  constructor(private readonly request: APIRequestContext) {}

  /**
   * Fetches an existing shipping option from the seeded data.
   * The seed script creates shipping options that are properly linked to
   * fulfillment providers, service zones, and stock locations.
   * 
   * This is more reliable than creating new shipping options because
   * creating new ones requires IDs from multiple related entities
   * (service_zone_id, shipping_profile_id) that are complex to obtain.
   */
  async createShippingOption(
    overrides: Partial<ShippingOption> & { region_id?: string } = {},
  ): Promise<ShippingOption> {
    // First try to use an existing seeded shipping option
    if (!this.cachedShippingOptions) {
      try {
        const response = await apiRequest<{ shipping_options: any[] }>({
          request: this.request,
          method: "GET",
          url: "/admin/shipping-options",
        });
        this.cachedShippingOptions = response.shipping_options || [];
      } catch (error) {
        console.warn("Failed to fetch shipping options, will try store endpoint:", error);
        this.cachedShippingOptions = [];
      }
    }

    // Return an existing shipping option if available
    if (this.cachedShippingOptions.length > 0) {
      const existingOption = this.cachedShippingOptions[0] as any;
      return {
        id: existingOption.id,
        name: existingOption.name || "Standard Shipping",
        price_type: existingOption.price_type || "flat",
        amount: existingOption.prices?.[0]?.amount || 1000,
        ...overrides,
      };
    }

    // If no admin shipping options found, try store shipping options
    // This requires a cart_id to be passed via overrides or we skip
    if (overrides.region_id) {
      try {
        // Create a temporary cart to get shipping options
        const salesChannelsRes = await apiRequest<{ sales_channels: any[] }>({
          request: this.request,
          method: "GET",
          url: "/admin/sales-channels",
        });
        const salesChannelId = salesChannelsRes.sales_channels?.[0]?.id;

        const cartResponse = await apiRequest<{ cart: { id: string } }>({
          request: this.request,
          method: "POST",
          url: "/store/carts",
          data: { 
            region_id: overrides.region_id,
            sales_channel_id: salesChannelId
          },
          headers: {
            "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "",
          },
        });
        
        const storeOptions = await apiRequest<{ shipping_options: any[] }>({
          request: this.request,
          method: "GET",
          url: `/store/carts/${cartResponse.cart.id}/shipping-options`,
        });
        
        if (storeOptions.shipping_options?.length > 0) {
          const storeOption = storeOptions.shipping_options[0];
          return {
            id: storeOption.id,
            name: storeOption.name || "Standard Shipping",
            price_type: storeOption.price_type || "flat",
            amount: storeOption.amount || 1000,
            ...overrides,
          };
        }
      } catch (error) {
        console.warn("Failed to fetch store shipping options:", error);
      }
    }

    // If all else fails, throw an error with instructions
    throw new Error(
      "No shipping options found. Ensure the backend is seeded with: pnpm --filter @gracestowel/backend seed:fresh"
    );
  }

  async cleanup(): Promise<void> {
    // Since we're using existing shipping options, no cleanup is needed
    // We don't delete seeded shipping options
    this.createdShippingOptionIds.length = 0;
  }
}


