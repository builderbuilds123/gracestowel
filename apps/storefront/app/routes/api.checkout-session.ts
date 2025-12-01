import { type ActionFunctionArgs, data } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    const { amount, currency, items } = await request.json() as {
        amount: number;
        currency: string;
        items: Array<{ title: string; price: string; quantity: number; image: string }>;
    };

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_51SUzHePAvLfNBsYSrPxY31co9kPMPB7tftZqE1KAibqnnqxVp5extgVzXcIY3zDppGQR640JofL2Wj92WDYd51jV002hrp1mK7";

    try {
        // Construct form-urlencoded body for Stripe API
        const body = new URLSearchParams();
        body.append("ui_mode", "embedded");
        body.append("mode", "payment");
        body.append("return_url", `${process.env.PUBLIC_URL || 'http://localhost:5173'}/checkout/return?session_id={CHECKOUT_SESSION_ID}`);

        items.forEach((item, index) => {
            body.append(`line_items[${index}][price_data][currency]`, currency || "usd");
            body.append(`line_items[${index}][price_data][product_data][name]`, item.title);
            const imageUrl = item.image.startsWith('http') ? item.image : `${process.env.PUBLIC_URL || 'http://localhost:5173'}${item.image}`;
            body.append(`line_items[${index}][price_data][product_data][images][0]`, imageUrl);
            const unitAmount = Math.round(parseFloat(item.price.replace('$', '')) * 100);
            body.append(`line_items[${index}][price_data][unit_amount]`, unitAmount.toString());
            body.append(`line_items[${index}][quantity]`, item.quantity.toString());
        });

        console.log("Creating checkout session via fetch...");

        const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
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
