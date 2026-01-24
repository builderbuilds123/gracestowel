import React, { useState, useCallback, useRef } from 'react';
import {
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
import { useCheckout } from './checkout/CheckoutProvider';
import { useCart } from '../context/CartContext';
import { createLogger } from '../lib/logger';
import { monitoredFetch } from '../utils/monitored-fetch';
import { ShippingSection } from './checkout/ShippingSection';
import { PaymentSection } from './checkout/PaymentSection';
import { setCachedSessionStorage } from '../lib/storage-cache';
// Re-export ShippingOption from types for backward compatibility
export type { ShippingOption } from '../types/checkout';

export interface CheckoutFormProps {
    onAddressChange?: (event: StripeAddressElementChangeEvent) => void;
    onEmailChange?: (email: string) => void;
}

/**
 * CheckoutForm - Pure checkout form with Stripe integration
 *
 * Note: Order editing is now handled by the dedicated /order/{id}/edit route.
 * This form is for new checkouts only.
 */
export function CheckoutForm({
    onAddressChange,
    onEmailChange,
}: CheckoutFormProps) {
    const {
        items,
        displayCartTotal: cartTotal,
        displayDiscountTotal: discountTotal,
        state: checkoutState,
        actions: checkoutActions,
        cartId,
        paymentCollectionId,
        isCalculatingShipping,
        isShippingPersisted,
        persistShippingOption,
        appliedPromoCodes
    } = useCheckout();

    // Get post-checkout state from cart context
    const { isPostCheckout } = useCart();

    const { 
        shippingOptions, 
        selectedShippingOption: selectedShipping, 
        email: guestEmail 
    } = checkoutState;
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
    const [isEmailComplete, setIsEmailComplete] = useState(false);
    const [isAddressComplete, setIsAddressComplete] = useState(false);
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
            const orderData = {
                items,
                subtotal: cartTotal,
                discount: discountTotal,
                appliedPromoCodes: appliedPromoCodes,
                shipping: selectedShipping?.amount || 0,
                total: cartTotal - discountTotal + (selectedShipping?.amount || 0),
                date: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
            };
            // DEBUG: Log what's being saved
            logger.info('Saving order to sessionStorage', {
                discountTotal,
                appliedPromoCodes: appliedPromoCodes.length,
                total: orderData.total
            });
            // Issue #42: Use cached sessionStorage for consistency
            setCachedSessionStorage('lastOrder', JSON.stringify(orderData));
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
            errors.payment = submitError.message || 'Please check your payment information.';
        }

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            
            // Scroll to the first error
            let scrollTarget: React.RefObject<HTMLDivElement | null> | null = null;
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
                const latestEmail = currentEmailRef.current || guestEmail;
                
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
                        amount: Math.round(opt.amount * 100), // Stripe expects cents, but our internal shipping options are in dollars
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
                checkoutActions.selectShippingOption(selectedRate);
            }
            event.resolve();
        },
        [shippingOptions, checkoutActions]
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
                    setMessage('The payment was not successful. Please try again.');
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
                    onChange={handleEmailChange}
                />
                {validationErrors.email ? (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.email}</p>
                ) : null}
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
                        fields: {
                            phone: 'always',
                        },
                    }}
                    onChange={handleAddressInternalChange}
                />
                {validationErrors.address ? (
                    <p className="text-red-600 text-sm mt-2">{validationErrors.address}</p>
                ) : null}
            </div>

            {/* Shipping Method Section */}
            <ShippingSection
                shippingOptions={shippingOptions}
                selectedShipping={selectedShipping}
                onSelectShipping={useCallback((option) => {
                    checkoutActions.selectShippingOption(option);
                    setValidationErrors(prev => ({ ...prev, shipping: '' }));
                }, [checkoutActions])}
                isCalculating={isCalculatingShipping}
                error={validationErrors.shipping}
                forwardedRef={shippingRef}
            />

            {/* Payment Section */}
            <PaymentSection
                error={validationErrors.payment}
                forwardedRef={paymentRef}
            />

            {/* Submit Button */}
            <button
                disabled={isLoading || !stripe || !elements}
                id="submit"
                className="w-full bg-accent-earthy hover:bg-accent-earthy/90 text-white font-medium py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md active:scale-[0.98] transform"
            >
                <span id="button-text">
                    {isLoading
                        ? (isPostCheckout ? 'Updating...' : 'Processing...')
                        : (isPostCheckout ? 'Update Now' : 'Pay now')
                    }
                </span>
            </button>

            <StripeBadge />

            {/* Error Message */}
            {message ? (
                <div id="payment-message" className="text-red-500 text-sm mt-2">
                    {message}
                </div>
            ) : null}
        </form>
    );
}



const StripeBadge = React.memo(function StripeBadge() {
    return (
        <div className="flex justify-center items-center gap-2 text-gray-400 text-xs mt-4">
            <svg
                viewBox="0 0 60 25"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 opacity-50 hover:opacity-100 transition-opacity"
            >
                <path
                    d="M59.6 14.3h-4.1v-1.9c0-.6 0-1.2-.1-1.7h4.2c.1.6.1 1.1.1 1.7v1.9zm-59.6-1.9h4.2c-.1.6-.1 1.1-.1 1.7v1.9H0c0-.6 0-1.2.1-1.7v-1.9zm10.6 1.9H6.6v-1.9c0-.6 0-1.2-.1-1.7h4.2c.1.6.1 1.1.1 1.7v1.9zm4.8-1.9h4.2c-.1.6-.1 1.1-.1 1.7v1.9h-4.1c0-.6 0-1.2.1-1.7v-1.9zm10.6 1.9h-4.1v-1.9c0-.6 0-1.2-.1-1.7h4.2c.1.6.1 1.1.1 1.7v1.9zm4.8-1.9h4.2c-.1.6-.1 1.1-.1 1.7v1.9h-4.1c0-.6 0-1.2.1-1.7v-1.9zm10.6 1.9h-4.1v-1.9c0-.6 0-1.2-.1-1.7h4.2c.1.6.1 1.1.1 1.7v1.9zm4.8-1.9h4.2c-.1.6-.1 1.1-.1 1.7v1.9h-4.1c0-.6 0-1.2.1-1.7v-1.9z"
                    fill="currentColor"
                />
                <path
                    d="M29.8 1.2c0-1.2 1.2-1.2 1.2-1.2h29v12.4h-4.1V4.1h-22v8.3h-4.1V1.2zm-29.8 0c0-1.2 1.2-1.2 1.2-1.2h24.5v12.4H21.6V4.1H4.1v8.3H0V1.2z"
                    fill="currentColor"
                />
                <path
                    d="M29.8 23.8c0 1.2 1.2 1.2 1.2 1.2h29V12.6h-4.1v8.3h-22v-8.3h-4.1v11.2zm-29.8 0c0 1.2 1.2 1.2 1.2 1.2h24.5V12.6H21.6v8.3H4.1v-8.3H0v11.2z"
                    fill="currentColor"
                />
            </svg>
            <span>
                Powered by <span className="font-bold">Stripe</span>
            </span>
        </div>
    );
});

export default CheckoutForm;

