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

    // UI Configuration
    ui: {
        headerScrollThreshold: 0.8, // Percentage of viewport height to trigger solid header
    },
} as const;

export default SITE_CONFIG;
