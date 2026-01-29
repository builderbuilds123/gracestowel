import { APIRequestContext } from "@playwright/test";
import { createOrder, Order } from "./order-factory";
import { apiRequest } from "../helpers/api-request";

export class OrderFactory {
  private readonly createdOrderIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createOrder(overrides: Partial<Order> = {}): Promise<Order> {
    const order = createOrder(overrides);

    // 0. Create a product if none provided to ensure we have a valid variant with manage_inventory: false
    const { ProductFactory } = await import("./product-factory-class");
    const productFactory = new ProductFactory(this.request);
    const product = await productFactory.createProduct();
    const variantId = product.variants?.[0]?.id || (product as any).variant_id;

    // 1. Get regions with their linked sales channels
    const regionsResponse = await apiRequest<{ regions: any[] }>({
      request: this.request,
      method: "GET",
      url: "/admin/regions?fields=+countries,+sales_channels,+currency_code",
    });

    // 2. Get Sales Channel (Prefer one associated with the product)
    let salesChannelId = (product as any).sales_channel_id;
    if (!salesChannelId) {
      const salesChannelsInput = await apiRequest<{ sales_channels: any[] }>({
        request: this.request,
        method: "GET",
        url: "/admin/sales-channels",
      });
      salesChannelId = salesChannelsInput.sales_channels?.[0]?.id;
    }

    // 3. Fetch variant prices to align region currency
    const variantResponse = await apiRequest<{ variant: any }>({
      request: this.request,
      method: "GET",
      url: `/admin/products/${product.id}/variants/${variantId}?fields=+prices`,
    });
    const variantCurrencies = (variantResponse.variant?.prices || [])
      .map((price: any) => price.currency_code)
      .filter((code: string | undefined) => Boolean(code));

    // 4. Find a region linked to this sales channel and supported by variant currency
    // In V2, a region is linked to 1 or more sales channels.
    let region = regionsResponse.regions.find(r =>
      r.sales_channels?.some((sc: any) => sc.id === salesChannelId) &&
      (variantCurrencies.length === 0 || variantCurrencies.includes(r.currency_code))
    );

    // If no region supports this sales channel, or if we just want to be safe:
    // Pick the first region and use one of ITS sales channels
    if (!region) {
      if (variantCurrencies.length > 0) {
        region = regionsResponse.regions.find(r =>
          variantCurrencies.includes(r.currency_code)
        );
      }
      if (!region) {
        console.warn(`[OrderFactory] Sales channel ${salesChannelId} not linked to any fetched region. Falling back to first available region.`);
        region = regionsResponse.regions[0];
      }
      const compatibleScId = region.sales_channels?.[0]?.id;
      if (compatibleScId) {
        console.warn(`[OrderFactory] Switched to region-compatible sales channel: ${compatibleScId}`);
        salesChannelId = compatibleScId;
      }
    }

    if (!region) {
      throw new Error("No regions found in the system. Seed may have failed.");
    }
    
    // Log for debugging
    console.log(`[OrderFactory] Selected Region: ${region.name} (${region.id}) for Sales Channel: ${salesChannelId}`);

    const regionId = region.id;
    // Debug available countries
    const availableCountries = region.countries?.map((c: any) => c.iso_2) || [];
    console.log(`[OrderFactory] Region ${region.name} supports countries: ${availableCountries.join(", ")}`);

    const countryCode = region.countries?.find((c: any) => c.iso_2 === "us")?.iso_2 
      || region.countries?.[0]?.iso_2 
      || "us";
    
    console.log(`[OrderFactory] Selected Country Code: ${countryCode}`);

    // 3. Create Cart with region and sales channel
    const cartResponse = await apiRequest<{ cart: { id: string } }>({
      request: this.request,
      method: "POST",
      url: "/store/carts",
      data: {
        region_id: regionId,
        sales_channel_id: salesChannelId,
      },
      headers: {
        "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "",
      },
    });
    const cartId = cartResponse.cart.id;

    // 3. Add Line Item
    await apiRequest({
      request: this.request,
      method: "POST",
      url: `/store/carts/${cartId}/line-items`,
      data: { variant_id: variantId, quantity: 1 },
    });

    // 4. Add Email and Shipping Address
    await apiRequest({
      request: this.request,
      method: "POST",
      url: `/store/carts/${cartId}`,
      data: {
        email: order.user.email || "test@example.com",
        shipping_address: {
          first_name: "Test",
          last_name: "User",
          address_1: "123 Test St",
          city: "Test City",
          country_code: countryCode,
          postal_code: "90001",
        },
      },
    });

    // 5. Add Shipping Method
    // Use /store/shipping-options?cart_id=:id to get options valid for this cart's region (V2 API)
    const shippingOptionsResponse = await apiRequest<{ shipping_options: { id: string; name: string; amount?: number }[] }>({
      request: this.request,
      method: "GET",
      url: `/store/shipping-options?cart_id=${cartId}`,
    });

    const shippingOptionId = shippingOptionsResponse.shipping_options?.find(so => so.amount !== undefined && so.amount !== null)?.id;
    if (!shippingOptionId) {
      throw new Error(
        `No shipping options available for cart ${cartId}. Seeded data may not have shipping for this region.`
      );
    }

    await apiRequest({
      request: this.request,
      method: "POST",
      url: `/store/carts/${cartId}/shipping-methods`,
      data: { option_id: shippingOptionId },
    });

    // 6. Initialize Payment Collection and Session
    const paymentCollection = await apiRequest<{ payment_collection: { id: string } }>({
      request: this.request,
      method: "POST",
      url: `/store/payment-collections`,
      data: { cart_id: cartId },
    });

    await apiRequest({
      request: this.request,
      method: "POST",
      url: `/store/payment-collections/${paymentCollection.payment_collection.id}/payment-sessions`,
      data: { provider_id: "pp_system_default" },
    });

    // 7. Complete Cart
    const completion = await apiRequest<any>({
      request: this.request,
      method: "POST",
      url: `/store/carts/${cartId}/complete`,
    });

    const seededOrderId =
      completion.order?.id || completion.data?.id || completion.id;
    if (!seededOrderId) {
      throw new Error(
        `Failed to complete order. Response: ${JSON.stringify(completion)}`,
      );
    }

    this.createdOrderIds.push(seededOrderId);
    return { ...order, id: seededOrderId };
  }

  async cleanup(): Promise<void> {
    for (const orderId of this.createdOrderIds) {
      try {
        const orderResponse = await apiRequest<{ order?: { fulfillments?: unknown[]; status?: string } }>({
          request: this.request,
          method: "GET",
          url: `/admin/orders/${orderId}`,
        });
        const fulfillmentCount = orderResponse.order?.fulfillments?.length ?? 0;
        const status = orderResponse.order?.status;
        if (fulfillmentCount > 0 || status === "canceled") {
          continue;
        }
        await apiRequest({
          request: this.request,
          method: "POST",
          url: `/admin/orders/${orderId}/cancel`,
        });
      } catch (error) {
        console.warn(`Order cleanup skipped for ${orderId}.`);
      }
    }
    this.createdOrderIds.length = 0;
  }
}
