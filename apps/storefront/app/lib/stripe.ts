import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Singleton pattern for Stripe instance
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
    if (!stripePromise) {
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) {
            console.error("VITE_STRIPE_PUBLISHABLE_KEY is not defined");
            return null;
        }
        stripePromise = loadStripe(publishableKey);
    }
    return stripePromise;
};
