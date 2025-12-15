import { ArrowLeft } from 'lucide-react';
import { Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { useCart } from '../context/CartContext';
import { useLocale } from '../context/LocaleContext';
import { useCustomer, getAuthToken } from '../context/CustomerContext';
import { initStripe, getStripe } from '../lib/stripe';
import { CheckoutForm, type ShippingOption } from '../components/CheckoutForm';
import { OrderSummary } from '../components/OrderSummary';

interface LoaderData {
    stripePublishableKey: string;
}

export async function loader({ context }: LoaderFunctionArgs): Promise<LoaderData> {
    const env = context.cloudflare.env as { STRIPE_PUBLISHABLE_KEY: string };
    return {
        stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
    };
}

export default function Checkout() {
    const { stripePublishableKey } = useLoaderData<LoaderData>();

    // Initialize Stripe with key from loader (runs once)
    useEffect(() => {
        if (stripePublishableKey) {
            initStripe(stripePublishableKey);
        }
    }, [stripePublishableKey]);
    const { items, cartTotal, updateQuantity, removeFromCart } = useCart();
    const { currency } = useLocale();
    const { customer, isAuthenticated } = useCustomer();
    const [clientSecret, setClientSecret] = useState("");
    const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
    const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
    const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

    // Calculate original total (before discount)
    const originalTotal = items.reduce((total, item) => {
        const originalPrice = item.originalPrice
            ? parseFloat(item.originalPrice.replace('$', ''))
            : parseFloat(item.price.replace('$', ''));
        return total + originalPrice * item.quantity;
    }, 0);

    const shippingCostCents = selectedShipping?.amount ?? 0;
    const shippingCost = shippingCostCents / 100;
    const finalTotal = cartTotal + shippingCost;

    const hasFiredCheckoutStarted = useRef(false);
    // Track checkout started event in PostHog
    useEffect(() => {
        if (cartTotal > 0 && typeof window !== 'undefined' && !hasFiredCheckoutStarted.current) {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.capture('checkout_started', {
                    cart_total: cartTotal,
                    item_count: items.length,
                    currency,
                    items: items.map(item => ({
                        product_id: item.id,
                        product_name: item.title,
                        quantity: item.quantity,
                        price: item.price,
                    })),
                });
            });
            hasFiredCheckoutStarted.current = true;
        }
    }, [cartTotal, items, currency]); // Run when cart updates, but use ref to fire only once

    useEffect(() => {
        if (cartTotal <= 0) return;

        // Create PaymentIntent WITHOUT shipping on initial load
        // Include cart items for order creation in webhook
        fetch("/api/payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                amount: cartTotal,
                currency: currency.toLowerCase(),
                shipping: 0, // Initially no shipping
                customerId: isAuthenticated ? customer?.id : undefined,
                customerEmail: isAuthenticated ? customer?.email : undefined,
                cartItems: items.map(item => ({
                    id: item.id,
                    variantId: item.variantId,
                    sku: item.sku,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    color: item.color,
                })),
            }),
        })
            .then((res) => res.json())
            .then((data) => setClientSecret((data as { clientSecret: string }).clientSecret));
    }, [cartTotal, currency, items, isAuthenticated, customer?.id]); // Depend on ID, not object reference

    // Separate effect to update PaymentIntent when shipping changes
    useEffect(() => {
        if (!clientSecret || !selectedShipping) return;

        // Update the PaymentIntent amount with shipping
        // Re-include cart items to ensure they're in metadata
        fetch("/api/payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                amount: cartTotal,
                currency: currency.toLowerCase(),
                shipping: shippingCost,
                customerId: isAuthenticated ? customer?.id : undefined,
                customerEmail: isAuthenticated ? customer?.email : undefined,
                cartItems: items.map(item => ({
                    id: item.id,
                    variantId: item.variantId,
                    sku: item.sku,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    color: item.color,
                })),
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                // Update client secret with new PaymentIntent
                setClientSecret((data as { clientSecret: string }).clientSecret);
            });
    }, [selectedShipping, items, isAuthenticated, customer?.id]); // Depend on ID, not object reference

    // Re-fetch shipping rates when cart total changes (for dynamic free shipping)
    useEffect(() => {
        if (shippingOptions.length === 0) return; // Only if we've already fetched once

        const refetchShipping = async () => {
            try {
                const response = await fetch("/api/shipping-rates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        subtotal: cartTotal
                    }),
                });

                const data = await response.json() as { shippingOptions: any[] };
                setShippingOptions(data.shippingOptions);

                // Update selected shipping if it exists
                if (selectedShipping) {
                    const updatedOption = data.shippingOptions.find(opt => opt.id === selectedShipping.id);
                    if (updatedOption) {
                        setSelectedShipping(updatedOption);
                    }
                }
            } catch (error) {
                console.error("Error refetching shipping rates:", error);
            }
        };

        refetchShipping();
    }, [cartTotal]); // Re-fetch when cart total changes

    // Handler for address changes
    const handleAddressChange = async (event: any) => {
        const addressValue = event.value;
        if (!addressValue || !addressValue.address || !addressValue.address.country) {
            return;
        }

        setIsCalculatingShipping(true);
        try {
            const response = await fetch("/api/shipping-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subtotal: cartTotal
                }),
            });

            const data = await response.json() as { shippingOptions: any[] };
            setShippingOptions(data.shippingOptions);

            // Auto-select first option
            if (data.shippingOptions.length > 0) {
                setSelectedShipping(data.shippingOptions[0]);
            }
        } catch (error) {
            console.error("Error fetching shipping rates:", error);
        } finally {
            setIsCalculatingShipping(false);
        }
    };

    const options = {
        clientSecret,
        appearance: {
            theme: 'stripe' as const,
            variables: {
                colorPrimary: '#8A6E59', // accent-earthy
                colorBackground: '#ffffff',
                colorText: '#3C3632', // text-earthy
                colorDanger: '#df1b41',
                fontFamily: 'Alegreya, system-ui, sans-serif',
                spacingUnit: '4px',
                borderRadius: '8px',
                // Custom variables to match site
                colorTextSecondary: '#6B7280', // gray-500
                gridRowSpacing: '16px',
            },
            rules: {
                '.Tab': {
                    border: '1px solid #D4D8C4', // card-earthy
                    boxShadow: 'none',
                    backgroundColor: '#FCFAF8', // bg-earthy
                },
                '.Tab:hover': {
                    borderColor: '#8A6E59',
                },
                '.Tab--selected': {
                    borderColor: '#8A6E59',
                    backgroundColor: '#ffffff',
                    color: '#8A6E59',
                    boxShadow: '0 0 0 1px #8A6E59',
                },
                '.Input': {
                    border: '1px solid #D4D8C4',
                    boxShadow: 'none',
                },
                '.Input:focus': {
                    border: '1px solid #8A6E59',
                    boxShadow: '0 0 0 1px #8A6E59',
                },
                '.Label': {
                    color: '#3C3632',
                    fontWeight: '500',
                    marginBottom: '8px',
                }
            }
        },
        fonts: [
            {
                cssSrc: 'https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&display=swap',
            }
        ],
    };

    if (cartTotal <= 0) {
        return (
            <div className="min-h-screen bg-card-earthy/10 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-serif text-text-earthy mb-4">Your towel rack is empty</h2>
                    <Link to="/" className="text-accent-earthy hover:underline">Return to Store</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-background-earthy min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-4">
                <div className="mb-8">
                    <Link to="/towels" className="inline-flex items-center text-text-earthy hover:text-accent-earthy transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Return to Towels
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                    {/* Checkout Form - Takes up more space */}
                    <div className="lg:col-span-7 space-y-8">
                        {clientSecret && (
                            <Elements options={options} stripe={getStripe()}>
                                <div className="bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20">
                                    <CheckoutForm
                                        items={items}
                                        cartTotal={cartTotal}
                                        onAddressChange={handleAddressChange}
                                        shippingOptions={shippingOptions}
                                        selectedShipping={selectedShipping}
                                        setSelectedShipping={setSelectedShipping}
                                        customerData={isAuthenticated && customer ? {
                                            email: customer.email,
                                            firstName: customer.first_name,
                                            lastName: customer.last_name,
                                            phone: customer.phone,
                                            address: customer.addresses?.[0] ? {
                                                line1: customer.addresses[0].address_1,
                                                line2: customer.addresses[0].address_2,
                                                city: customer.addresses[0].city,
                                                state: customer.addresses[0].province,
                                                postal_code: customer.addresses[0].postal_code,
                                                country: customer.addresses[0].country_code?.toUpperCase(),
                                            } : undefined,
                                        } : undefined}
                                    />
                                </div>
                            </Elements>
                        )}
                    </div>

                    {/* Order Summary */}
                    <OrderSummary
                        items={items}
                        cartTotal={cartTotal}
                        originalTotal={originalTotal}
                        selectedShipping={selectedShipping}
                        shippingCost={shippingCost}
                        finalTotal={finalTotal}
                        onUpdateQuantity={updateQuantity}
                        onRemoveFromCart={removeFromCart}
                    />
                </div>
            </div>
        </div>
    );
}
