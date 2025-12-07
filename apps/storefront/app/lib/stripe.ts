import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Singleton pattern for Stripe instance
// Key is passed from server via loader to avoid client-side env access
let stripePromise: Promise<Stripe | null>;
let cachedKey: string | null = null;

export const initStripe = (publishableKey: string): void => {
    if (!cachedKey && publishableKey) {
        cachedKey = publishableKey;
        stripePromise = loadStripe(publishableKey);
    }
};

export const getStripe = (): Promise<Stripe | null> => {
    if (!stripePromise) {
        console.error("Stripe not initialized. Call initStripe() first with the publishable key from loader.");
        return Promise.resolve(null);
    }
    return stripePromise;
};
