import { useState, useCallback, useRef } from 'react';
import {
    PaymentElement,
    useStripe,
    useElements,
    LinkAuthenticationElement,
    AddressElement,
    ExpressCheckoutElement,
} from '@stripe/react-stripe-js';
import type {
    StripeExpressCheckoutElementConfirmEvent,
    StripeExpressCheckoutElementShippingAddressChangeEvent,
    StripeExpressCheckoutElementShippingRateChangeEvent,
    StripeAddressElementChangeEvent,
    StripeLinkAuthenticationElementChangeEvent,
} from '@stripe/stripe-js';
import type { CartItem } from '../context/CartContext';
import { createLogger } from '../lib/logger';
import { monitoredFetch } from '../utils/monitored-fetch';

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
    onAddressChange?: (event: StripeAddressElementChangeEvent) => void;
    onEmailChange?: (email: string) => void;
    shippingOptions: ShippingOption[];
    selectedShipping: ShippingOption | null;
    setSelectedShipping: (option: ShippingOption) => void;
    customerData?: CustomerData;
    isCalculatingShipping?: boolean;
    isShippingPersisted?: boolean; 
    persistShippingOption: (option: ShippingOption) => Promise<void>;
    paymentCollectionId: string | null;
    guestEmail?: string;
    cartId: string;
}

export function CheckoutForm({
    items,
    cartTotal,
    onAddressChange,
    onEmailChange,
    shippingOptions,
    selectedShipping,
    setSelectedShipping,
    customerData,
    isCalculatingShipping = false,
    isShippingPersisted = true,
    persistShippingOption,
    paymentCollectionId,
    guestEmail,
    cartId
}: CheckoutFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const logger = createLogger();

    // Refs for scrolling to errors
    const emailRef = useRef<HTMLDivElement>(null);
    const addressRef = useRef<HTMLDivElement>(null);
    const shippingRef = useRef<HTMLDivElement>(null);
    const paymentRef = useRef<HTMLDivElement>(null);

    // Track component completeness
    // Initialize based on customerData if available (for returning customers)
    const [isEmailComplete, setIsEmailComplete] = useState(!!customerData?.email);
    const [isAddressComplete, setIsAddressComplete] = useState(
        !!(customerData?.address?.line1 && 
           customerData?.address?.city && 
           customerData?.address?.state && 
           customerData?.address?.postal_code && 
           customerData?.address?.country)
    );
    const [isPaymentComplete, setIsPaymentComplete] = useState(false);

    // Track latest email value locally for atomic sync (even if incomplete or parent update lags)
    const currentEmailRef = useRef<string>("");

    const handleEmailChange = useCallback(
        (event: StripeLinkAuthenticationElementChangeEvent) => {
            setIsEmailComplete(event.complete);
            const email = event.value?.email;
            
            // Always update local ref for latest value
            if (email) {
                currentEmailRef.current = email;
            }

            if (event.complete && email && onEmailChange) {
                onEmailChange(email);
            }
            // Clear error if now complete
            if (event.complete) {
                setValidationErrors(prev => ({ ...prev, email: '' }));
            }
        },
        [onEmailChange]
    );

    const handleAddressInternalChange = useCallback(
        (event: StripeAddressElementChangeEvent) => {
            setIsAddressComplete(event.complete);
            if (onAddressChange) {
                onAddressChange(event);
            }
            // Clear error if now complete
            if (event.complete) {
                setValidationErrors(prev => ({ ...prev, address: '' }));
            }
        },
        [onAddressChange]
    );

    // SEC-05: Use sessionStorage instead of localStorage for ephemeral checkout data
    // sessionStorage clears when tab closes, preventing shared device access
    const saveOrderToSessionStorage = () => {
        try {
            sessionStorage.setItem(
                'lastOrder',
                JSON.stringify({
                    items,
                    subtotal: cartTotal,
                    shipping: selectedShipping?.amount || 0,
                    total: cartTotal + (selectedShipping?.amount || 0),
                    date: new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }),
                })
            );
        } catch (error) {
            // Non-critical: storage failures don't block checkout
            // Errors can occur in private browsing mode, storage full, or storage disabled
            // Order details will still be available from cart context on success page
            logger.warn('Failed to save order to sessionStorage', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        // 1. Validate all sections
        const errors: Record<string, string> = {};
        
        if (!isEmailComplete) {
            errors.email = 'Please enter your email address.';
        }
        
        if (!isAddressComplete) {
            errors.address = 'Please complete your shipping address.';
        }
        
        if (!selectedShipping) {
            errors.shipping = 'Please select a shipping method.';
        }

        // Check if PaymentElement is complete (Stripe validation)
        const { error: submitError } = await elements.submit();
        if (submitError) {
            // Stripe handles showing its own errors, but we track it for scrolling
            errors.payment = submitError.message || 'Please check your payment details.';
        }

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            
            // Scroll to the first error
            let scrollTarget: any = null;
            if (errors.email) scrollTarget = emailRef;
            else if (errors.address) scrollTarget = addressRef;
            else if (errors.shipping) scrollTarget = shippingRef;
            else if (errors.payment) scrollTarget = paymentRef;

            if (scrollTarget?.current) {
                scrollTarget.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            return;
        }

        setIsLoading(true);
        setMessage(null);

        try {
            // 2. Persist shipping to Medusa (updates cart total)
            if (selectedShipping) {
                await persistShippingOption(selectedShipping);
            }

            // ATOMIC FIX: Explicitly sync email and address to cart before payment
            // This ensures no race conditions with the parent's debounced sync
            // ATOMIC FIX: Explicitly sync email and address to cart before payment
            // REFACTOR: Use local ref for email and direct Element value for address to ensure we have LATEST input
            // ignoring parent state lag or "complete" event filters.
            
            if (cartId) {
                const latestEmail = currentEmailRef.current || guestEmail || customerData?.email;
                
                // Get fully validated address directly from Stripe Element
                const addressElement = elements.getElement(AddressElement);
                let latestAddressPayload = undefined;
                
                if (addressElement) {
                    const addressResult = await addressElement.getValue();
                    if (addressResult.complete && addressResult.value) {
                         const addr = addressResult.value;
                         
                         // Parse name logic (same as checkout.tsx)
                        let firstName = '';
                        let lastName = '';
                        if (addr.name) {
                            const parts = addr.name.split(' ');
                            firstName = parts[0];
                            lastName = parts.slice(1).join(' ');
                            if (!lastName) lastName = firstName;
                        }

                         latestAddressPayload = {
                            first_name: firstName,
                            last_name: lastName,
                            address_1: addr.address.line1,
                            address_2: addr.address.line2,
                            city: addr.address.city,
                            country_code: addr.address.country,
                            postal_code: addr.address.postal_code,
                            province: addr.address.state,
                            phone: addr.phone,
                         };
                    }
                }

                if (latestEmail) {
                    await monitoredFetch(`/api/carts/${cartId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: latestEmail,
                            shipping_address: latestAddressPayload // Sync address too if available
                        }),
                        label: 'atomic-email-sync'
                    });
                }
            }

            // 3. Re-fetch PaymentSession to get the new PI/clientSecret
            // We use the same API endpoint that usePaymentSession uses
            const sessionResponse = await monitoredFetch(
                `/api/payment-collections/${paymentCollectionId}/sessions`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider_id: "pp_stripe" }),
                    label: "refresh-session-on-submit",
                }
            );

            if (!sessionResponse.ok) {
                throw new Error('Failed to refresh payment session');
            }

            const sessionData = await sessionResponse.json() as any;
            const updatedClientSecret = sessionData.payment_collection?.payment_sessions?.find(
                (s: any) => s.provider_id === "pp_stripe"
            )?.data?.client_secret;

            if (!updatedClientSecret) {
                throw new Error('New client secret not found');
            }

            // Persist order details for success page
            saveOrderToSessionStorage();

            // 4. Confirm payment with the NEW clientSecret
            const { error } = await stripe.confirmPayment({
                elements,
                clientSecret: updatedClientSecret, // CRITICAL: Use the new secret matching the updated PI
                confirmParams: {
                    return_url: `${window.location.origin}/checkout/success`,
                },
            });

            if (error) {
                logger.error('Payment confirmation failed', undefined, {
                    errorType: error.type,
                    errorCode: error.code,
                    errorMessage: error.message,
                });
                setMessage(error.message || 'An unexpected error occurred.');
            }
        } catch (err: any) {
            logger.error('Atomic submission failed', err);
            setMessage(err.message || 'Submission failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };



    // Handle shipping address change in Express Checkout (GPay/Apple Pay)
    // This provides shipping options to the wallet UI
    const handleExpressShippingAddressChange = useCallback(
        async (event: StripeExpressCheckoutElementShippingAddressChangeEvent) => {
            // Resolve with available shipping rates
            // The wallet UI will display these options to the user
            if (shippingOptions.length > 0) {
                event.resolve({
                    shippingRates: shippingOptions.map((opt) => ({
                        id: opt.id,
                        displayName: opt.displayName,
                        amount: opt.amount, // Already in cents from shipping-rates API
                    })),
                });
            } else {
                // If no shipping rates are available, resolve with empty array
                // The wallet UI will usually show pending state or no options
                event.resolve({
                    shippingRates: [],
                });
            }
        },
        [shippingOptions]
    );

    // Handle shipping rate selection in Express Checkout
    const handleExpressShippingRateChange = useCallback(
        (event: StripeExpressCheckoutElementShippingRateChangeEvent) => {
            // Find and select the shipping option that matches the selected rate
            const selectedRate = shippingOptions.find(
                (opt) => opt.id === event.shippingRate.id
            );
            if (selectedRate) {
                setSelectedShipping(selectedRate);
            }
            event.resolve();
        },
        [shippingOptions, setSelectedShipping]
    );

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
            saveOrderToSessionStorage();

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
                    onShippingAddressChange={handleExpressShippingAddressChange}
                    onShippingRateChange={handleExpressShippingRateChange}
                    options={{
                        buttonType: {
                            applePay: 'check-out',
                            googlePay: 'checkout',
                            paypal: 'checkout'
                        },
                    }}
                />
            </div>

            <div className="relative flex py-5 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">Or</span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>

            {/* Contact Section */}
            <div 
                ref={emailRef} 
                className={`p-4 rounded-lg transition-all ${validationErrors.email ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
            >
                <h2 className="text-lg font-medium mb-4">Contact</h2>
                <LinkAuthenticationElement
                    id="link-authentication-element"
                    options={customerData?.email ? { defaultValues: { email: customerData.email } } : undefined}
                    onChange={handleEmailChange}
                />
                {validationErrors.email && (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.email}</p>
                )}
            </div>

            {/* Delivery Section */}
            <div 
                ref={addressRef}
                className={`p-4 rounded-lg transition-all ${validationErrors.address ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
            >
                <h2 className="text-lg font-medium mb-4">Delivery</h2>
                <AddressElement
                    id="address-element"
                    options={{
                        mode: 'shipping',
                        fields: { phone: 'always' },
                        // Remove split name to use default full name field (Stripe Standard)
                        defaultValues: customerData ? {
                            name: `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim(),
                            phone: customerData.phone ?? '',
                            address: customerData.address ? {
                                line1: customerData.address.line1 ?? '',
                                line2: customerData.address.line2 ?? '',
                                city: customerData.address.city ?? '',
                                state: customerData.address.state ?? '',
                                postal_code: customerData.address.postal_code ?? '',
                                country: customerData.address.country ?? 'US',
                            } : undefined,
                        } : undefined,
                    }}
                    onChange={handleAddressInternalChange}
                />
                {validationErrors.address && (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.address}</p>
                )}
            </div>

            {/* Shipping Method Section */}
            <div 
                ref={shippingRef}
                className={`p-4 rounded-lg transition-all ${validationErrors.shipping ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
            >
                {isCalculatingShipping ? (
                    <div className="mt-6 text-sm text-gray-500">
                        Calculating shipping rates...
                    </div>
                ) : shippingOptions.length > 0 ? (
                    <>
                        <ShippingMethodSelector
                            options={shippingOptions}
                            selected={selectedShipping}
                            onSelect={(option) => {
                                setSelectedShipping(option);
                                setValidationErrors(prev => ({ ...prev, shipping: '' }));
                            }}
                        />
                        <div className="text-xs text-gray-300 mt-2 font-mono">
                            Debug: Cart Total used for Shipping: ${(cartTotal).toFixed(2)}
                        </div>
                    </>
                ) : (
                    <p className="text-gray-500 text-sm italic">Please enter your address to see shipping options.</p>
                )}
                {validationErrors.shipping && (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.shipping}</p>
                )}
            </div>

            {/* Payment Section */}
            <div 
                ref={paymentRef}
                className={`p-4 rounded-lg transition-all ${validationErrors.payment ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
            >
                <h2 className="text-lg font-medium mb-4">Payment</h2>
                <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />
                {validationErrors.payment && (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.payment}</p>
                )}
            </div>

            {/* Submit Button */}
            <button
                disabled={isLoading || !stripe || !elements}
                id="submit"
                className="w-full bg-accent-earthy hover:bg-accent-earthy/90 text-white font-medium py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md active:scale-[0.98] transform"
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
                                    ${option.amount.toFixed(2)}
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

