import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch } from "../utils/monitored-fetch";

export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    const { amount, currency, items } = await request.json() as {
        amount: number;
        currency: string;
        items: Array<{ title: string; price: string; quantity: number; image: string }>;
    };

    // Access full Cloudflare env to include PostHog config for monitoredFetch
    const env = context.cloudflare.env as {
      STRIPE_SECRET_KEY: string;
      VITE_POSTHOG_API_KEY?: string;
      VITE_POSTHOG_HOST?: string;
      POSTHOG_API_KEY?: string;
      POSTHOG_HOST?: string;
      POSTHOG_SERVER_CAPTURE_ENABLED?: string | boolean;
      [key: string]: unknown;
    };
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;

    try {
        // Construct form-urlencoded body for Stripe API
        const body = new URLSearchParams();
        body.append("ui_mode", "embedded");
        body.append("mode", "payment");
        
        const origin = new URL(request.url).origin;
        body.append("return_url", `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`);

        items.forEach((item, index) => {
            body.append(`line_items[${index}][price_data][currency]`, currency || "usd");
            body.append(`line_items[${index}][price_data][product_data][name]`, item.title);
            const imageUrl = item.image.startsWith('http') ? item.image : `${origin}${item.image}`;
            body.append(`line_items[${index}][price_data][product_data][images][0]`, imageUrl);
            const unitAmount = Math.round(parseFloat(item.price.replace('$', '')) * 100);
            body.append(`line_items[${index}][price_data][unit_amount]`, unitAmount.toString());
            body.append(`line_items[${index}][quantity]`, item.quantity.toString());
        });

        console.log("Creating checkout session via fetch...");

        const response = await monitoredFetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
            label: "stripe-checkout-session",
            skipTracking: true,
            cloudflareEnv: env,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Stripe API error:", errorText);
            throw new Error(`Stripe API error: ${response.status} ${response.statusText}`);
        }

        const session = await response.json() as { id: string; client_secret: string };
        console.log("Checkout session created:", session.id);
        return { clientSecret: session.client_secret };
    } catch (error) {
        console.error("Error creating checkout session:", error);
        return data({ message: "Error creating checkout session" }, { status: 500 });
    }
}
