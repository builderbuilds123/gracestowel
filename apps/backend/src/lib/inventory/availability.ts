/**
 * Clamps inventory availability to 0 for storefront/backend read paths.
 * Prevents negative numbers from being surfaced as "false stock" to users.
 * 
 * AC4: Storefront availability masking
 */
export function clampAvailability(quantity: number | null | undefined): number {
    if (quantity === null || quantity === undefined) {
        return 0;
    }
    return Math.max(0, quantity);
}

/**
 * Formats a list of inventory levels for storefront safety.
 */
export function formatSafeInventoryLevels(levels: any[]) {
    return levels.map(level => ({
        ...level,
        available_quantity: clampAvailability(level.stocked_quantity),
    }));
}
