import { type ActionFunctionArgs, data } from "react-router";
import { SITE_CONFIG } from "../config/site";
import { monitoredFetch } from "../utils/monitored-fetch";

// Get shipping configuration from centralized config
const { rateIds: SHIPPING_RATES, groundShippingId: GROUND_SHIPPING_ID, freeThreshold: FREE_SHIPPING_THRESHOLD } = SITE_CONFIG.shipping;

export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    const { subtotal } = await request.json() as {
        subtotal: number;
    };

    const env = context.cloudflare.env as { STRIPE_SECRET_KEY: string };
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;

    try {
        // Fetch shipping rates from Stripe
        const shippingOptions = await Promise.all(
            SHIPPING_RATES.map(async (rateId) => {
                const response = await monitoredFetch(`https://api.stripe.com/v1/shipping_rates/${rateId}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
                    },
                    label: "stripe-shipping-rate",
                    skipTracking: true,
                    cloudflareEnv: env,
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch shipping rate ${rateId}`);
                }

                const rate = await response.json() as {
                    id: string;
                    display_name: string;
                    fixed_amount: { amount: number; currency: string };
                    delivery_estimate?: { maximum?: { unit: string; value: number }; minimum?: { unit: string; value: number } };
                };

                // Apply free shipping logic for ground shipping
                const isGroundShipping = rateId === GROUND_SHIPPING_ID;
                const isFreeShipping = isGroundShipping && subtotal >= FREE_SHIPPING_THRESHOLD;

                // Stripe returns fixed_amount.amount in cents (smallest currency unit)
                // Keep it in cents for consistency with display components
                const originalAmountCents = rate.fixed_amount.amount;
                const amountCents = isFreeShipping ? 0 : originalAmountCents;

                console.log(`Shipping rate ${rate.display_name}:`, {
                    isGroundShipping,
                    subtotal,
                    threshold: FREE_SHIPPING_THRESHOLD,
                    isFreeShipping,
                    originalAmountCents,
                    finalAmountCents: amountCents
                });

                return {
                    id: rate.id,
                    displayName: rate.display_name,
                    amount: amountCents,
                    originalAmount: originalAmountCents, // Always include original price in cents
                    deliveryEstimate: rate.delivery_estimate ?
                        `${rate.delivery_estimate.minimum?.value || ''}-${rate.delivery_estimate.maximum?.value || ''} ${rate.delivery_estimate.maximum?.unit || 'days'}` :
                        null,
                    isFree: isFreeShipping
                };
            })
        );

        return { shippingOptions };
    } catch (error: any) {
        console.error("Error fetching shipping rates:", error);
        return data({ message: `Error fetching shipping rates: ${error.message || error}` }, { status: 500 });
    }
}
