import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Singleton pattern for Stripe instance
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
    if (!stripePromise) {
        stripePromise = loadStripe(
            "pk_test_51SUzHePAvLfNBsYS9Ey7HtypfmA28w0rfkTQPCrRvJMkBP1DUkN2zNfJtI5VoI566LaDrJoeO6GsbuQAv2JC3FUA00Gt5crRWu"
        );
    }
    return stripePromise;
};
