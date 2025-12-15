import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { MedusaCartService } from "../services/medusa-cart";
import type { CartItem, ProductId } from "../types/product";
import { isMedusaId } from "../types/product";

interface ShippingRatesRequest {
  cartItems: CartItem[];
  shippingAddress?: {
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    country_code: string;
    postal_code: string;
    phone?: string;
    province?: string;
  };
  currency: string;
  cartId?: string;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ message: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env as CloudflareEnv & {
    MEDUSA_BACKEND_URL?: string;
    MEDUSA_PUBLISHABLE_KEY?: string;
  };

  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!medusaPublishableKey) {
    throw new Error("Missing MEDUSA_PUBLISHABLE_KEY environment variable");
  }

  // Parse request body
  let body: ShippingRatesRequest;
  try {
    body = await request.clone().json() as ShippingRatesRequest;
  } catch (e) {
    return data({ message: "Invalid request body" }, { status: 400 });
  }

  const { cartItems, shippingAddress, currency = "CAD", cartId: initialCartId } = body;

  const service = new MedusaCartService(context);

  try {
    let cartId = initialCartId;

    // 1. If we have a cartId, try to use it
    if (cartId) {
      try {
        const cart = await service.getCart(cartId);
        if (!cart) {
          cartId = undefined; // Cart expired or invalid
        }
      } catch (e) {
        console.warn("Error checking cart:", e);
        cartId = undefined;
      }
    }

    // 2. If no valid cartId, create one
    if (!cartId) {
        // Need to find region ID for currency first
        // We can reuse the existing logic or add a helper in service
        // For now, let's keep it simple and assume we can fetch regions here or via service
        // Since MedusaCartService takes region_id for creation, we need to fetch regions first.

        // Fetch regions to find region_id for currency
        const regionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/regions`, {
            method: "GET",
            headers: { "x-publishable-api-key": medusaPublishableKey },
            label: "medusa-regions",
            cloudflareEnv: env,
        });

        if (regionsResponse.ok) {
             const { regions } = await regionsResponse.json() as { regions: any[] };
             const region = regions.find((r: any) => r.currency_code.toUpperCase() === currency.toUpperCase()) || regions[0];

             if (region) {
                 cartId = await service.getOrCreateCart(region.id, currency);
             } else {
                 throw new Error("No valid region found");
             }
        } else {
             throw new Error("Failed to fetch regions");
        }
    }

    if (!cartId) {
        throw new Error("Failed to initialize cart");
    }

    // 3. Sync Items
    // Filter items to only include those with Medusa variant IDs
    const validItems = cartItems.filter(item => item.variantId && isMedusaId(item.variantId));
    // Also include legacy items if we have a way to map them, but for now assuming we only sync mapped items

    await service.syncCartItems(cartId, validItems);

    // 4. Update Address
    if (shippingAddress) {
        await service.updateShippingAddress(cartId, shippingAddress);
    }

    // 5. Get Options
    const shippingOptions = await service.getShippingOptions(cartId);

    // 6. Map Response
    const formattedOptions = shippingOptions.map(opt => ({
        id: opt.id,
        displayName: opt.name,
        amount: opt.amount,
        originalAmount: opt.originalAmount,
        isFree: opt.amount === 0,
        deliveryEstimate: null
    }));

    return { shippingOptions: formattedOptions, cartId };

  } catch (error: any) {
    console.error("Cart-based shipping failed:", error);

    // Fallback to simple region-based fetch if cart operations fail
    console.warn("Falling back to region-based shipping");

    // We can essentially reuse the old logic here, or just fail gracefully.
    // Given the prompt says "API failure -> fallback to region-based fetch", we should implement the fallback.
    // Since I overwrote the file, I'll re-implement the fallback logic (from the previous version of this file).

    try {
        const regionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/regions`, {
            method: "GET",
            headers: { "x-publishable-api-key": medusaPublishableKey },
            label: "medusa-regions",
            cloudflareEnv: env,
        });

        if (!regionsResponse.ok) throw new Error("Regions fetch failed");

        const { regions } = await regionsResponse.json() as { regions: any[] };
        const region = regions.find((r: any) => r.currency_code.toUpperCase() === currency.toUpperCase()) || regions[0];
        
        if (!region) throw new Error("No region found");

        const optionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/shipping-options?region_id=${region.id}`, {
            method: "GET",
            headers: { "x-publishable-api-key": medusaPublishableKey },
            label: "medusa-shipping-options",
            cloudflareEnv: env,
        });

        if (!optionsResponse.ok) throw new Error("Options fetch failed");

        const { shipping_options } = await optionsResponse.json() as { shipping_options: any[] };

        const formattedOptions = shipping_options.map((option: any) => ({
            id: option.id,
            displayName: option.name,
            amount: option.amount,
            originalAmount: undefined, // No promo info in fallback
            isFree: option.amount === 0,
            deliveryEstimate: null
        }));

        // Return without cartId to indicate fallback
        return { shippingOptions: formattedOptions, cartId: undefined };

    } catch (fallbackError) {
        console.error("Fallback shipping failed:", fallbackError);
        return data({ message: "An error occurred while calculating shipping rates." }, { status: 500 });
    }
  }
}
