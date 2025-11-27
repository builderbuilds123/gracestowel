import { type ActionFunctionArgs, data } from "react-router";
import { SITE_CONFIG } from "../config/site";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_51SUzHePAvLfNBsYSrPxY31co9kPMPB7tftZqE1KAibqnnqxVp5extgVzXcIY3zDppGQR640JofL2Wj92WDYd51jV002hrp1mK7";

// Get shipping configuration from centralized config
const { rateIds: SHIPPING_RATES, groundShippingId: GROUND_SHIPPING_ID, freeThreshold: FREE_SHIPPING_THRESHOLD } = SITE_CONFIG.shipping;

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    const { subtotal } = await request.json() as {
        subtotal: number;
    };

    try {
        // Fetch shipping rates from Stripe
        const shippingOptions = await Promise.all(
            SHIPPING_RATES.map(async (rateId) => {
                const response = await fetch(`https://api.stripe.com/v1/shipping_rates/${rateId}`, {
                    headers: {
                        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
                    }
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
                const amount = isFreeShipping ? 0 : rate.fixed_amount.amount / 100;

                console.log(`Shipping rate ${rate.display_name}:`, {
                    isGroundShipping,
                    subtotal,
                    threshold: FREE_SHIPPING_THRESHOLD,
                    isFreeShipping,
                    originalAmount: rate.fixed_amount.amount / 100,
                    finalAmount: amount
                });

                return {
                    id: rate.id,
                    displayName: rate.display_name,
                    amount: amount,
                    originalAmount: rate.fixed_amount.amount / 100, // Always include original price
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
