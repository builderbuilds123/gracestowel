
import { useEffect, useState } from "react";
import { X, Loader2, ShieldCheck } from "lucide-react";
import {
    PaymentElement,
    useStripe,
    useElements,
    Elements
} from "@stripe/react-stripe-js";
import { initStripe, getStripe } from "../../lib/stripe";

interface OrderEditPaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    clientSecret: string;
    stripePublishableKey: string;
    orderId: string;
    token: string;
    amount: number;
    currencyCode: string;
}

function PaymentForm({ amount, currencyCode, onClose, orderId, token }: { 
    amount: number; 
    currencyCode: string; 
    onClose: () => void;
    orderId: string;
    token: string;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setError(null);

        const { error: submitError } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Redirect back to the order status page with the token
                return_url: `${window.location.origin}/order/status/${orderId}?token=${token}&payment_success=true`,
            },
        });

        // This point will only be reached if there is an immediate error when
        // confirming the payment. Otherwise, your customer will be redirected to
        // your `return_url`.
        if (submitError) {
            setError(submitError.message || "An unexpected error occurred.");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-4 bg-accent-earthy/5 border border-accent-earthy/20 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-text-earthy/70">Amount Due</span>
                    <span className="text-xl font-bold text-accent-earthy">
                        {amount.toFixed(2)} {currencyCode.toUpperCase()}
                    </span>
                </div>
                <p className="text-xs text-text-earthy/60">
                    Additional payment required to confirm your order modifications.
                </p>
            </div>

            <PaymentElement options={{ layout: "tabs" }} />

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <button
                    disabled={isLoading || !stripe}
                    className="w-full py-4 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium shadow-md"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        `Pay ${amount.toFixed(2)} ${currencyCode.toUpperCase()}`
                    )}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="w-full py-2 text-sm text-text-earthy/60 hover:text-text-earthy transition-colors disabled:opacity-50"
                >
                    Cancel & Discard Changes
                </button>
            </div>
            
            <div className="flex justify-center items-center gap-2 text-gray-400 text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Secure payment powered by Stripe</span>
            </div>
        </form>
    );
}

export function OrderEditPaymentDialog({
    isOpen,
    onClose,
    clientSecret,
    stripePublishableKey,
    orderId,
    token,
    amount,
    currencyCode
}: OrderEditPaymentDialogProps) {
    const [stripePromise, setStripePromise] = useState<ReturnType<typeof getStripe> | null>(null);

    useEffect(() => {
        if (stripePublishableKey) {
            initStripe(stripePublishableKey);
            setStripePromise(getStripe());
        } else {
            setStripePromise(null);
        }
    }, [stripePublishableKey]);
    if (!isOpen) return null;

    if (!stripePublishableKey) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-card-earthy/5">
                        <h2 className="text-xl font-serif text-text-earthy">Complete Modification</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            Payment is unavailable because the Stripe publishable key is missing.
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (!stripePromise) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-card-earthy/5">
                        <h2 className="text-xl font-serif text-text-earthy">Complete Modification</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                            Initializing secure payment…
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const options = {
        clientSecret,
        appearance: {
            theme: "stripe" as const,
            variables: {
                colorPrimary: "#8A6E59",
                colorBackground: "#ffffff",
                colorText: "#3C3632",
                fontFamily: "Alegreya, system-ui, sans-serif",
                borderRadius: "8px",
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-card-earthy/5">
                    <h2 className="text-xl font-serif text-text-earthy">Complete Modification</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6">
                    <Elements stripe={stripePromise} options={options}>
                        <PaymentForm 
                            amount={amount} 
                            currencyCode={currencyCode} 
                            onClose={onClose} 
                            orderId={orderId}
                            token={token}
                        />
                    </Elements>
                </div>
            </div>
        </div>
    );
}
