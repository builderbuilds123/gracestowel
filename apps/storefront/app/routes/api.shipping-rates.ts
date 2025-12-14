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
            throw new Error("Failed to fetch regions");
        }

        const { regions } = await regionsResponse.json() as { regions: any[] };
        const region = regions[0]; // Default to first region

        if (!region) {
            throw new Error("No regions found");
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
            throw new Error("Failed to fetch shipping options");
        }

        const { shipping_options } = await optionsResponse.json() as { shipping_options: any[] };

        // 3. Map to frontend format
        // We do NOT apply any client-side price overrides. We trust Medusa.
        const formattedOptions = shipping_options.map((option) => ({
            id: option.id,
            displayName: option.name,
            amount: option.amount, // Medusa returns amount in cents (usually)
            originalAmount: option.amount,
            deliveryEstimate: null, // Medusa doesn't standardly return this, could be in metadata
            isFree: option.amount === 0,
        }));

        return { shippingOptions: formattedOptions };

    } catch (error: any) {
        console.error("Error fetching shipping rates:", error);
        return data({ message: `Error fetching shipping rates: ${error.message || error}` }, { status: 500 });
    }
}
