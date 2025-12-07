import { useState } from 'react';
import {
    PaymentElement,
    useStripe,
    useElements,
    LinkAuthenticationElement,
    AddressElement,
    ExpressCheckoutElement,
} from '@stripe/react-stripe-js';
import type { StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import type { CartItem } from '../context/CartContext';

export interface ShippingOption {
    id: string;
    displayName: string;
    amount: number;
    originalAmount?: number;
    isFree?: boolean;
    deliveryEstimate?: string;
}

export interface CustomerData {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
    };
}

export interface CheckoutFormProps {
    items: CartItem[];
    cartTotal: number;
    onAddressChange?: (event: { value: { address: { country: string } } }) => void;
    shippingOptions: ShippingOption[];
    selectedShipping: ShippingOption | null;
    setSelectedShipping: (option: ShippingOption) => void;
    customerData?: CustomerData;
}

export function CheckoutForm({
    items,
    cartTotal,
    onAddressChange,
    shippingOptions,
    selectedShipping,
    setSelectedShipping,
    customerData,
}: CheckoutFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const saveOrderToLocalStorage = () => {
        localStorage.setItem(
            'lastOrder',
            JSON.stringify({
                items,
                total: cartTotal,
                date: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
            })
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsLoading(true);

        // Persist order details for success page
        saveOrderToLocalStorage();

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/checkout/success`,
            },
        });

        if (error) {
            if (error.type === 'card_error' || error.type === 'validation_error') {
                setMessage(error.message || 'An unexpected error occurred.');
            } else {
                setMessage('An unexpected error occurred.');
            }
        }

        setIsLoading(false);
    };

    const handleExpressConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
        if (!stripe || !elements) {
            return;
        }

        setIsLoading(true);
        try {
            const { error: submitError } = await elements.submit();
            if (submitError) {
                setMessage(submitError.message || 'Submission failed');
                return;
            }

            // Persist order details for success page
            saveOrderToLocalStorage();

            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/checkout/success`,
                    shipping: event.shippingAddress ? {
                        name: event.shippingAddress.name,
                        address: {
                            line1: event.shippingAddress.address.line1,
                            line2: event.shippingAddress.address.line2 || undefined,
                            city: event.shippingAddress.address.city,
                            state: event.shippingAddress.address.state,
                            postal_code: event.shippingAddress.address.postal_code,
                            country: event.shippingAddress.address.country,
                        },
                    } : undefined,
                },
            });

            if (error) {
                if (error.type === 'card_error' || error.type === 'validation_error') {
                    setMessage(error.message || 'An unexpected error occurred.');
                } else {
                    setMessage('An unexpected error occurred.');
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-8">
            {/* Express Checkout Section */}
            <div className="mb-8">
                <ExpressCheckoutElement 
                    onConfirm={handleExpressConfirm} 
                    options={{ 
                        buttonType: { 
                            applePay: 'check-out', 
                            googlePay: 'checkout', 
                            paypal: 'checkout' 
                        } 
                    }} 
                />
            </div>

            <div className="relative flex py-5 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">Or</span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>

            {/* Contact Section */}
            <div>
                <h2 className="text-lg font-medium mb-4">Contact</h2>
                <LinkAuthenticationElement
                    id="link-authentication-element"
                    options={customerData?.email ? { defaultValues: { email: customerData.email } } : undefined}
                />
            </div>

            {/* Delivery Section */}
            <div>
                <h2 className="text-lg font-medium mb-4">Delivery</h2>
                <AddressElement
                    id="address-element"
                    options={{
                        mode: 'shipping',
                        fields: { phone: 'always' },
                        display: { name: 'split' },
                        defaultValues: customerData ? {
                            firstName: customerData.firstName || '',
                            lastName: customerData.lastName || '',
                            phone: customerData.phone || '',
                            address: customerData.address ? {
                                line1: customerData.address.line1 || '',
                                line2: customerData.address.line2 || '',
                                city: customerData.address.city || '',
                                state: customerData.address.state || '',
                                postal_code: customerData.address.postal_code || '',
                                country: customerData.address.country || 'US',
                            } : undefined,
                        } : undefined,
                    }}
                    onChange={onAddressChange}
                />

                {/* Shipping Method Selection */}
                {shippingOptions.length > 0 && (
                    <ShippingMethodSelector
                        options={shippingOptions}
                        selected={selectedShipping}
                        onSelect={setSelectedShipping}
                    />
                )}
            </div>

            {/* Payment Section */}
            <div>
                <h2 className="text-lg font-medium mb-4">Payment</h2>
                <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />
            </div>

            {/* Submit Button */}
            <button
                disabled={isLoading || !stripe || !elements}
                id="submit"
                className="w-full bg-accent-earthy hover:bg-accent-earthy/90 text-white font-medium py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
                <span id="button-text">
                    {isLoading ? 'Processing...' : 'Pay now'}
                </span>
            </button>

            {/* Stripe Badge */}
            <StripeBadge />

            {/* Error Message */}
            {message && (
                <div id="payment-message" className="text-red-500 text-sm mt-2">
                    {message}
                </div>
            )}
        </form>
    );
}

interface ShippingMethodSelectorProps {
    options: ShippingOption[];
    selected: ShippingOption | null;
    onSelect: (option: ShippingOption) => void;
}

function ShippingMethodSelector({ options, selected, onSelect }: ShippingMethodSelectorProps) {
    return (
        <div className="mt-6">
            <h3 className="text-base font-medium mb-4 text-text-earthy">Shipping method</h3>
            <div className="space-y-3">
                {options.map((option) => (
                    <label
                        key={option.id}
                        className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            selected?.id === option.id
                                ? 'border-accent-earthy bg-accent-earthy/5'
                                : 'border-gray-200 hover:border-accent-earthy/50'
                        }`}
                    >
                        <div className="flex items-center gap-3 flex-1">
                            <input
                                type="radio"
                                name="shipping"
                                checked={selected?.id === option.id}
                                onChange={() => onSelect(option)}
                                className="w-5 h-5 text-accent-earthy"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-text-earthy">
                                    {option.displayName}
                                </div>
                                {option.deliveryEstimate && (
                                    <div className="text-sm text-gray-500 mt-0.5">
                                        {option.deliveryEstimate}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            {option.isFree ? (
                                <span className="font-bold text-text-earthy">FREE</span>
                            ) : (
                                <span className="font-semibold text-text-earthy">
                                    ${(option.amount / 100).toFixed(2)}
                                </span>
                            )}
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}

function StripeBadge() {
    return (
        <div className="flex justify-center items-center gap-2 text-gray-400 text-xs mt-4">
            <svg
                viewBox="0 0 60 25"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 opacity-50 hover:opacity-100 transition-opacity"
            >
                <path
                    d="M59.64 14.28h-4.06v-1.91c0-.58-.04-1.16-.1-1.72h4.16c.06.56.1 1.14.1 1.72v1.91zm-59.64-1.91h4.16c-.06.56-.1 1.14-.1 1.72v1.91h-4.06c0-.58.04-1.16.1-1.72v-1.91zm10.63 1.91h-4.06v-1.91c0-.58-.04-1.16-.1-1.72h4.16c.06.56.1 1.14.1 1.72v1.91zm4.75-1.91h4.16c-.06.56-.1 1.14-.1 1.72v1.91h-4.06c0-.58.04-1.16.1-1.72v-1.91zm10.63 1.91h-4.06v-1.91c0-.58-.04-1.16-.1-1.72h4.16c.06.56.1 1.14.1 1.72v1.91zm4.75-1.91h4.16c-.06.56-.1 1.14-.1 1.72v1.91h-4.06c0-.58.04-1.16.1-1.72v-1.91zm10.63 1.91h-4.06v-1.91c0-.58-.04-1.16-.1-1.72h4.16c.06.56.1 1.14.1 1.72v1.91zm4.75-1.91h4.16c-.06.56-.1 1.14-.1 1.72v1.91h-4.06c0-.58.04-1.16.1-1.72v-1.91z"
                    fill="currentColor"
                />
                <path
                    d="M29.82 1.21c0-1.21 1.21-1.21 1.21-1.21h28.97v12.37h-4.06v-8.31h-22.01v8.31h-4.11V1.21zm-29.82 0c0-1.21 1.21-1.21 1.21-1.21h24.5v12.37h-4.11v-8.31h-17.54v8.31h-4.06V1.21z"
                    fill="currentColor"
                />
                <path
                    d="M29.82 23.79c0 1.21 1.21 1.21 1.21 1.21h28.97V12.63h-4.06v8.31h-22.01v-8.31h-4.11v11.16zm-29.82 0c0 1.21 1.21 1.21 1.21 1.21h24.5V12.63h-4.11v8.31h-17.54v-8.31h-4.06v11.16z"
                    fill="currentColor"
                />
            </svg>
            <span>
                Powered by <span className="font-bold">Stripe</span>
            </span>
        </div>
    );
}

export default CheckoutForm;

