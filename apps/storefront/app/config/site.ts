/**
 * Centralized site configuration
 * Single source of truth for branding, company info, and site-wide constants
 */

export const SITE_CONFIG = {
    // Company/Brand Info
    name: "Grace Stowel",
    tagline: "Premium Turkish Cotton Towels",

    // Contact
    email: "hello@gracestowel.com",
    phone: "+1 (555) 123-4567",

    // Social Media
    social: {
        instagram: "https://instagram.com/gracestowel",
        facebook: "https://facebook.com/gracestowel",
        twitter: "https://twitter.com/gracestowel"
    },

    // Cart & Free Gift Configuration
    cart: {
        freeGift: {
            legacyId: 4,
            handle: "the-wool-dryer-ball",
            threshold: 35, // Minimum cart value for free gift
            label: "Free Gift",
        },
        // Cart reward milestones (used by CartProgressBar)
        milestones: [
            { price: 35, label: "Free Wool Dryer Ball", position: 25 },
            { price: 50, label: "Free Tote Bag", position: 50 },
            { price: 75, label: "Free Embroidery", position: 75 },
            { price: 99, label: "Free Delivery", position: 100 },
        ] as const,
    },

    // Shipping Configuration
    shipping: {
        freeThreshold: 99, // Minimum cart value for free shipping
        // Stripe shipping rate IDs
        rateIds: [
            "shr_1SW9u3PAvLfNBsYSFIx10mCw", // Priority shipping
            "shr_1SW9vmPAvLfNBsYSBqUtUEk0", // Ground shipping
        ],
        groundShippingId: "shr_1SW9vmPAvLfNBsYSBqUtUEk0",
    },

    // UI Configuration
    ui: {
        headerScrollThreshold: 0.8, // Percentage of viewport height to trigger solid header
    },

    // Legacy aliases for backward compatibility
    freeGiftThreshold: 35,
    freeShippingThreshold: 99,
} as const;

// Type exports for type safety
export type CartMilestone = typeof SITE_CONFIG.cart.milestones[number];

export default SITE_CONFIG;
