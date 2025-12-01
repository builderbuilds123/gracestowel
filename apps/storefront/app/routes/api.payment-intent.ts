import { type ActionFunctionArgs, data } from "react-router";

interface CartItem {
    id: string | number;
    variantId?: string;
    sku?: string;
    title: string;
    price: string;
    quantity: number;
    color?: string;
}

interface ShippingAddress {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
    phone?: string;
}

interface PaymentIntentRequest {
    amount: number;
    currency: string;
    shipping?: number;
    cartItems?: CartItem[];
    customerId?: string;
    customerEmail?: string;
    shippingAddress?: ShippingAddress;
}

interface StockValidationResult {
    valid: boolean;
    outOfStockItems: Array<{ title: string; requested: number; available: number }>;
}

/**
 * Validate stock availability for cart items
 */
async function validateStock(cartItems: CartItem[]): Promise<StockValidationResult> {
    const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const outOfStockItems: StockValidationResult["outOfStockItems"] = [];

    for (const item of cartItems) {
        if (!item.variantId) continue; // Skip items without variant IDs (legacy items)

        try {
            // Fetch product to get variant inventory
            const response = await fetch(
                `${MEDUSA_BACKEND_URL}/store/products?fields=+variants,+variants.inventory_quantity`,
                {
                    headers: { "Content-Type": "application/json" },
                }
            );

            if (!response.ok) continue;

            const data = await response.json();
            const products = data.products || [];

            // Find the variant in any product
            for (const product of products) {
                const variant = product.variants?.find((v: { id: string }) => v.id === item.variantId);
                if (variant) {
                    const available = variant.inventory_quantity ?? Infinity;
                    if (item.quantity > available) {
                        outOfStockItems.push({
                            title: item.title,
                            requested: item.quantity,
                            available: Math.max(0, available),
                        });
                    }
                    break;
                }
            }
        } catch (error) {
            console.error(`Error checking stock for ${item.title}:`, error);
            // Continue without blocking - we'll catch issues at order creation
        }
    }

    return {
        valid: outOfStockItems.length === 0,
        outOfStockItems,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ message: "Method not allowed" }, { status: 405 });
    }

    const {
        amount,
        currency,
        shipping,
        cartItems,
        customerId,
        customerEmail,
        shippingAddress
    } = await request.json() as PaymentIntentRequest;

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

    if (!STRIPE_SECRET_KEY) {
        console.error("STRIPE_SECRET_KEY environment variable is not set");
        return data({ message: "Payment service not configured" }, { status: 500 });
    }

    try {
        // Validate stock availability before creating PaymentIntent
        if (cartItems && cartItems.length > 0) {
            const stockValidation = await validateStock(cartItems);
            if (!stockValidation.valid) {
                const itemMessages = stockValidation.outOfStockItems
                    .map(item => `${item.title}: only ${item.available} available (requested ${item.requested})`)
                    .join(", ");
                return data(
                    {
                        message: `Some items are out of stock: ${itemMessages}`,
                        outOfStockItems: stockValidation.outOfStockItems
                    },
                    { status: 400 }
                );
            }
        }

        // Calculate total amount including shipping
        const totalAmount = amount + (shipping || 0);

        const body = new URLSearchParams();
        body.append("amount", Math.round(totalAmount * 100).toString());
        body.append("currency", currency || "usd");
        body.append("automatic_payment_methods[enabled]", "true");

        // Options for US Bank Account (ACH) - Financial Connections
        body.append("payment_method_options[us_bank_account][financial_connections][permissions][0]", "payment_method");

        // Options for Canadian Pre-authorized Debits (ACSS)
        body.append("payment_method_options[acss_debit][mandate_options][payment_schedule]", "sporadic");
        body.append("payment_method_options[acss_debit][mandate_options][transaction_type]", "personal");
        body.append("payment_method_options[acss_debit][verification_method]", "automatic");

        // Add cart data to metadata for order creation in webhook
        if (cartItems && cartItems.length > 0) {
            const cartData = JSON.stringify({
                items: cartItems.map(item => ({
                    variantId: item.variantId,
                    sku: item.sku,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    color: item.color,
                }))
            });
            body.append("metadata[cart_data]", cartData);
        }

        // Add customer info to metadata for order creation
        if (customerId) {
            body.append("metadata[customer_id]", customerId);
        }

        if (customerEmail) {
            body.append("metadata[customer_email]", customerEmail);
        }

        if (shippingAddress) {
            body.append("metadata[shipping_address]", JSON.stringify(shippingAddress));
        }

        const response = await fetch("https://api.stripe.com/v1/payment_intents", {
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
            throw new Error(`Stripe API error: ${errorText}`);
        }

        const paymentIntent = await response.json() as { client_secret: string };
        return { clientSecret: paymentIntent.client_secret };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error creating payment intent:", error);
        return data({ message: `Error creating payment intent: ${errorMessage}` }, { status: 500 });
    }
}
