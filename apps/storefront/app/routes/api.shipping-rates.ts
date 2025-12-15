import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch } from "../utils/monitored-fetch";

export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    // Access full Cloudflare env
    const env = context.cloudflare.env as {
        MEDUSA_BACKEND_URL?: string;
        MEDUSA_PUBLISHABLE_KEY?: string;
        [key: string]: unknown;
    };

    const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY || "";

    try {
        // Parse request body for currency context
        let currency = "CAD"; // Default
        try {
            const body = await request.clone().json() as { currency?: string };
            if (body.currency) {
                currency = body.currency;
            }
        } catch (e) {
            console.warn("Could not parse request body for currency, using default.");
        }

        // 1. Get Regions (to find default currency/region)
        // In a real app, this should come from the user's session or selection
        const regionsResponse = await monitoredFetch(`${medusaBackendUrl}/store/regions`, {
            method: "GET",
            headers: {
                "x-publishable-api-key": medusaPublishableKey,
            },
            label: "medusa-regions",
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
        });

        if (!optionsResponse.ok) {
            console.error(`Failed to fetch shipping options: ${optionsResponse.status} ${optionsResponse.statusText}`);
            throw new Error("Unable to retrieve shipping options");
        }

        const { shipping_options } = await optionsResponse.json() as { shipping_options: any[] };

        // 3. Map to frontend format
        // We do NOT apply any client-side price overrides. We trust Medusa.
        const formattedOptions = shipping_options.map((option: any) => ({
            id: option.id,
            displayName: option.name,
            amount: option.amount, // Medusa returns amount in cents (usually)
            originalAmount: option.amount,
            deliveryEstimate: null, // Medusa doesn't standardly return this, could be in metadata
            isFree: option.amount === 0,
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
