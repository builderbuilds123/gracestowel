/**
 * Centralized color mapping for product swatches.
 * Maps descriptive color names from the Medusa backend to hex codes for UI rendering.
 */

export const PRODUCT_COLOR_MAP: Record<string, string> = {
    // Original colors
    "Cloud White": "#F5F5F5",
    "Sage": "#9CAF88",
    "Terra Cotta": "#E2725B",
    "Charcoal": "#36454F",
    "Navy": "#202A44",
    "Sand": "#E6DCD0",
    "Stone": "#9EA3A8",
    
    // New colors from seed data
    "Sunset Orange": "#FF8C00",
    "Ocean Blue": "#2980B9",
    "Walnut": "#5D4037",
    "Slate": "#4A5568",
    
    // Patterns
    "Checkered Red": "#B22222",
    "Classic Stripe": "#2F4F4F",
};

/**
 * Gets the hex code for a given color name, falling back to a default grey if not found.
 */
export function getColorHex(colorName: string): string {
    return PRODUCT_COLOR_MAP[colorName] || "#E2E8F0";
}
