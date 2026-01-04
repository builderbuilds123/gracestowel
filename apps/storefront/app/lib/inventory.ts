/**
 * Inventory Availability Utilities (Storefront)
 *
 * Provides helper functions for safely handling inventory quantities,
 * particularly for storefront read paths where negative stock
 * should not be surfaced to users.
 *
 * AC4 (INV-02): Storefront availability masking - clamp negative to 0
 */

/**
 * Clamps inventory availability to 0 for storefront read paths.
 * Prevents negative numbers from being surfaced as "false stock" to users.
 *
 * @param quantity - The raw inventory_quantity value (may be negative for backorders)
 * @returns The clamped quantity (minimum 0)
 *
 * @example
 * clampAvailability(10)    // => 10
 * clampAvailability(-5)    // => 0  (backordered item)
 * clampAvailability(null)  // => 0
 * clampAvailability(undefined) // => 0
 */
export function clampAvailability(quantity: number | null | undefined): number {
    if (quantity === null || quantity === undefined) {
        return 0;
    }
    return Math.max(0, quantity);
}
