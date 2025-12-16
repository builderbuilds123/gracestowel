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

/**
 * Extract the original amount from a prices array.
 * Medusa API returns prices in cents (smallest currency unit).
 */
function extractAmountFromPrices(
    prices: any[] | undefined,
    regionId: string,
    currency: string
): number | undefined {
    if (!Array.isArray(prices) || prices.length === 0) {
        return undefined;
    }

    // Find price matching the region's currency or region ID
    const regionPrice = prices.find((p: any) =>
        p.region_id === regionId || p.currency_code?.toUpperCase() === currency.toUpperCase()
    );

    if (regionPrice && typeof regionPrice.amount === 'number') {
        return regionPrice.amount;
    }

    // Fallback to first price
    if (prices[0] && typeof prices[0].amount === 'number') {
        return prices[0].amount;
    }

    return undefined;
}

/**
 * Extract original amount from a shipping option object.
 */
function extractOriginalAmount(
    option: any,
    regionId: string,
    currency: string
): number | undefined {
    // Try prices array first
    const fromPrices = extractAmountFromPrices(option.prices, regionId, currency);
    if (fromPrices !== undefined) {
        return fromPrices;
    }

    // Check for a single price field
    if (option.price && typeof option.price === 'number') {
        return option.price;
    }

    return undefined;
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
    const validItems = cartItems.filter(item => item.variantId && isMedusaId(item.variantId));
    await service.syncCartItems(cartId, validItems);

    // 4. Update Address
    if (shippingAddress) {
        await service.updateShippingAddress(cartId, shippingAddress);
    }

    // 5. Get Options
    const shippingOptions = await service.getShippingOptions(cartId);

    // 6. Map Response
    // We need to fetch regions again to support extractOriginalAmount if needed, or pass it down.
    // However, the service response might already be simplified.
    // To support `originalAmount`, `MedusaCartService.getShippingOptions` should ideally return the raw option or enough data.
    // Let's modify the service or just fetch details here if free.
    // But `MedusaCartService` already returns an array of objects.
    // Let's look at `medusa-cart.ts` again. It returns:
    // { id, name, amount, price_type, provider_id, is_return, originalAmount? }

    // In `medusa-cart.ts`, I left `originalAmount` as potentially undefined.
    // Since Medusa's `cart.shipping_methods` or `shipping_options` endpoint with cart context calculates the *discounted* price as `amount`.
    // If we want the original price, we might need to inspect metadata or rules.
    // But typically, for free shipping promotions, the `amount` becomes 0.
    // The `originalAmount` might be available if we fetch the option *definition* from `/store/shipping-options` (without cart context or with region context) and match it.

    // So, let's fetch the region-based options to find the base price for comparison.
    // This effectively duplicates the logic from the fallback but uses it for enrichment.

    let regionId = "";
    const cart = await service.getCart(cartId);
    if (cart) {
        regionId = cart.region_id;
    }

    let regionOptions: any[] = [];
    if (regionId) {
        try {
            const optionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/shipping-options?region_id=${regionId}`, {
                method: "GET",
                headers: { "x-publishable-api-key": medusaPublishableKey },
                label: "medusa-shipping-options-enrich",
                cloudflareEnv: env,
            });
            if (optionsResponse.ok) {
                const data = await optionsResponse.json() as { shipping_options: any[] };
                regionOptions = data.shipping_options;
            }
        } catch (e) {
            console.warn("Failed to fetch region options for enrichment", e);
        }
    }

    const formattedOptions = shippingOptions.map(opt => {
        let originalAmount = opt.originalAmount;

        // If not present (it won't be from service usually), try to find it in regionOptions
        if (originalAmount === undefined && regionOptions.length > 0) {
            const regionOption = regionOptions.find((ro: any) => ro.id === opt.id);
            if (regionOption) {
                originalAmount = extractOriginalAmount(regionOption, regionId, currency);
            }
        }

        // If explicitly free (amount 0) and we found an original amount, that's our strikethrough.
        // If amount > 0 but different from original, that's a discount.

        return {
            id: opt.id,
            displayName: opt.name,
            amount: opt.amount,
            originalAmount: originalAmount !== opt.amount ? originalAmount : undefined,
            isFree: opt.amount === 0,
            deliveryEstimate: null
        };
    });

    return { shippingOptions: formattedOptions, cartId };

  } catch (error: any) {
    // Log the actual error for debugging
    console.error("Cart-based shipping failed:", error);
    
    // Return clear error - Medusa v2 requires cart_id for shipping options,
    // so there's no valid fallback without a cart. Surface the real error.
    return data({ 
        message: "Unable to calculate shipping rates. Please try again.",
        error: error.message 
    }, { status: 500 });
  }
}
