import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";

/**
 * Extract the original amount from a prices array.
 * Medusa API returns prices in cents (smallest currency unit).
 * 
 * @param prices - Array of price objects from Medusa
 * @param regionId - The region ID to match
 * @param currency - The currency code to match
 * @returns The amount in cents, or undefined if not found
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
        // Medusa API returns amounts in cents
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
 * Checks multiple possible locations where the price might be stored.
 * 
 * @param option - Shipping option object from Medusa
 * @param regionId - The region ID to match
 * @param currency - The currency code to match
 * @returns The amount in cents, or undefined if not found
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

    // Check for a single price field (already in cents from Medusa)
    if (option.price && typeof option.price === 'number') {
        return option.price;
    }

    return undefined;
}

export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    // Access full Cloudflare env
    const env = context.cloudflare.env as CloudflareEnv & {
        MEDUSA_BACKEND_URL?: string;
        MEDUSA_PUBLISHABLE_KEY?: string;
    };

    const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    if (!medusaPublishableKey) {
        throw new Error("Missing MEDUSA_PUBLISHABLE_KEY environment variable");
    }

    try {
        // Parse request body for currency context
        let currency = "CAD"; // Default
        try {
            const body = await request.clone().json() as { currency?: string };
            if (body.currency) {
                currency = body.currency;
            }
        } catch (e) {
            console.warn("Could not parse request body for currency, defaulting to CAD.");
        }

        // 1. Get Regions (to find default currency/region)
        // In a real app, this should come from the user's session or selection
        const regionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/regions`, {
            method: "GET",
            headers: {
                "x-publishable-api-key": medusaPublishableKey,
            },
            label: "medusa-regions",
            cloudflareEnv: env,
        });

        if (!regionsResponse.ok) {
            console.error(`Failed to fetch regions: ${regionsResponse.status} ${regionsResponse.statusText}`);
            throw new Error("Unable to retrieve shipping regions");
        }

        const { regions } = await regionsResponse.json() as { regions: any[] };
        
        // Find region matching currency
        let region = regions.find((r: any) => r.currency_code.toUpperCase() === currency.toUpperCase());

        if (!region) {
            console.warn(`No region found for currency ${currency}, falling back to first region.`);
            region = regions[0]; // Fallback
        }

        if (!region) {
            throw new Error("No valid shipping region found");
        }

        // 2. Fetch Shipping Options for the region
        const optionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/shipping-options?region_id=${region.id}`, {
            method: "GET",
            headers: {
                "x-publishable-api-key": medusaPublishableKey,
            },
            label: "medusa-shipping-options",
            cloudflareEnv: env,
        });

        if (!optionsResponse.ok) {
            console.error(`Failed to fetch shipping options: ${optionsResponse.status} ${optionsResponse.statusText}`);
            throw new Error("Unable to retrieve shipping options");
        }

        const { shipping_options } = await optionsResponse.json() as { shipping_options: any[] };

        // 3. Map to frontend format
        // We do NOT apply any client-side price overrides. We trust Medusa.
        const formattedOptions = await Promise.all(shipping_options.map(async (option: any) => {
            const amount = typeof option.amount === 'number' ? option.amount : 0;
            const isFree = amount === 0;
            
            // Try to get originalAmount from Medusa's response
            let originalAmount =
                typeof option.original_amount === 'number'
                    ? option.original_amount
                    : (typeof option?.metadata?.original_amount === 'number' ? option.metadata.original_amount : undefined);

            // If shipping is free and originalAmount is not provided, try to get the base price
            if (isFree && originalAmount === undefined) {
                // First, try to extract from the option's prices array or price field
                originalAmount = extractOriginalAmount(option, region.id, currency);

                // If still not found, try to fetch shipping option details as a fallback
                if (originalAmount === undefined) {
                    try {
                        const optionDetailResponse = await monitoredFetch(
                            `${medusaBackendUrl}/store/shipping-options/${option.id}`,
                            {
                                method: "GET",
                                headers: {
                                    "x-publishable-api-key": medusaPublishableKey,
                                },
                                label: "medusa-shipping-option-detail",
                                cloudflareEnv: env,
                            }
                        );

                        if (optionDetailResponse.ok) {
                            const optionDetail = await optionDetailResponse.json() as { shipping_option?: any };
                            const detail = optionDetail.shipping_option || optionDetail;
                            originalAmount = extractOriginalAmount(detail, region.id, currency);
                        }
                    } catch (error) {
                        // If fetching option details fails, log but don't fail the entire request
                        // This is expected if the Store API doesn't support individual option details
                        console.warn(`Could not fetch base price for free shipping option ${option.id}. Original amount will not be displayed.`);
                    }
                }
            }

            const originalAmountToShow =
                originalAmount !== undefined && originalAmount !== amount ? originalAmount : undefined;

            return {
                id: option.id,
                displayName: option.name,
                amount,
                // Only include originalAmount if it differs from amount so the UI doesn't cross out $0.00
                originalAmount: originalAmountToShow,
                deliveryEstimate: null, // Medusa doesn't standardly return this, could be in metadata
                isFree,
            };
        }));

        return { shippingOptions: formattedOptions };

    } catch (error: any) {
        // Structured logging (basic)
        console.error(JSON.stringify({
            event: "shipping_rates_error",
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        
        return data({ message: "An error occurred while calculating shipping rates." }, { status: 500 });
    }
}
