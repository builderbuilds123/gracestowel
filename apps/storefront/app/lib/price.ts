/**
 * Price utilities for the Grace Stowel storefront
 * 
 * This module provides consistent price parsing and formatting functions
 * to replace duplicated logic across the codebase.
 */

/**
 * Supported currency codes
 */
export type CurrencyCode = 'USD' | 'CAD' | 'EUR' | 'GBP';

/**
 * Default currency for the storefront
 */
export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

/**
 * Parse a formatted price string to a numeric value
 * 
 * @example
 * parsePrice("$35.00") // 35
 * parsePrice("$1,234.56") // 1234.56
 * parsePrice("35.00") // 35
 * parsePrice("$0.00") // 0
 * 
 * @param formatted - Price string with optional currency symbol and commas
 * @returns Numeric price value
 */
export function parsePrice(formatted: string): number {
    if (!formatted) return 0;
    
    // Remove currency symbols, commas, and whitespace
    const cleaned = formatted.replace(/[$€£,\s]/g, '');
    const parsed = parseFloat(cleaned);
    
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format a numeric price to a display string
 * 
 * @example
 * formatPrice(35) // "$35.00"
 * formatPrice(35, 'CAD') // "CA$35.00"
 * formatPrice(1234.5) // "$1,234.50"
 * 
 * @param amount - Numeric price value (in dollars, not cents)
 * @param currency - Currency code (default: USD)
 * @returns Formatted price string
 */
export function formatPrice(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(amount);
}

/**
 * Format a price from cents to a display string
 * Used for Medusa prices which are stored in cents
 * 
 * @example
 * formatPriceCents(3500) // "$35.00"
 * formatPriceCents(3500, 'CAD') // "CA$35.00"
 * 
 * @param cents - Price in cents (smallest currency unit)
 * @param currency - Currency code (default: USD)
 * @returns Formatted price string
 */
export function formatPriceCents(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
    return formatPrice(cents / 100, currency);
}

/**
 * Convert a price from dollars to cents
 * 
 * @example
 * toCents(35) // 3500
 * toCents(35.99) // 3599
 * 
 * @param amount - Price in dollars
 * @returns Price in cents
 */
export function toCents(amount: number): number {
    return Math.round(amount * 100);
}

/**
 * Convert a price from cents to dollars
 * 
 * @example
 * fromCents(3500) // 35
 * fromCents(3599) // 35.99
 * 
 * @param cents - Price in cents
 * @returns Price in dollars
 */
export function fromCents(cents: number): number {
    return cents / 100;
}

/**
 * Calculate the total price for a collection of items
 * Each item should have a 'price' (formatted string) and 'quantity'
 * 
 * @example
 * calculateTotal([
 *   { price: "$35.00", quantity: 2 },
 *   { price: "$18.00", quantity: 1 }
 * ]) // 88
 * 
 * @param items - Array of items with price and quantity
 * @returns Total price as a number
 */
export function calculateTotal(items: Array<{ price: string; quantity: number }>): number {
    return items.reduce((total, item) => {
        const price = parsePrice(item.price);
        return total + price * item.quantity;
    }, 0);
}

/**
 * Check if a price represents a free item
 * 
 * @example
 * isFreePrice("$0.00") // true
 * isFreePrice("$35.00") // false
 * 
 * @param formatted - Formatted price string
 * @returns True if the price is zero
 */
export function isFreePrice(formatted: string): boolean {
    return parsePrice(formatted) === 0;
}

/**
 * Calculate discount percentage between original and current price
 * 
 * @example
 * calculateDiscountPercent(100, 80) // 20
 * calculateDiscountPercent(50, 35) // 30
 * 
 * @param originalPrice - Original price
 * @param currentPrice - Current/sale price
 * @returns Discount percentage (0-100)
 */
export function calculateDiscountPercent(originalPrice: number, currentPrice: number): number {
    if (originalPrice <= 0 || currentPrice >= originalPrice) return 0;
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

