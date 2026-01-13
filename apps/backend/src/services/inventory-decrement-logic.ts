import { Logger } from "@medusajs/framework/types";

export interface InventoryLocationResolverInput {
    salesChannelId?: string | null;
    preferredLocationIds?: string[];
}

/**
 * Service to resolve the best stock location for a given context.
 * Replaces the complex InventoryDecrementService as we now use native reservations.
 */
export class InventoryLocationResolver {
    private logger: Logger;
    private query: any;

    constructor({ logger, query }: { logger: Logger; query: any }) {
        this.logger = logger;
        this.query = query;
    }

    async resolveItemLocation(variantId: string, input: InventoryLocationResolverInput, quantity: number): Promise<{ inventory_item_id: string; location_id: string } | null> {
        // 1. Get Inventory Item ID for Variant
        const { data: variants } = await this.query.graph({
            entity: "product_variant",
            fields: ["inventory_items.inventory_item_id"],
            filters: { id: variantId },
        });
        
        const inventoryItemId = variants?.[0]?.inventory_items?.[0]?.inventory_item_id;
        if (!inventoryItemId) {
            this.logger.warn(`No inventory item found for variant ${variantId}`);
            return null;
        }

        // 2. Resolve Potential Locations
        const preferred = new Set<string>(input.preferredLocationIds?.filter(Boolean) ?? []);
        
        let channelLocations = new Set<string>();
        if (input.salesChannelId) {
             const { data: salesChannels } = await this.query.graph({
                entity: "sales_channel",
                fields: ["stock_locations.id"],
                filters: { id: input.salesChannelId },
            });
            const locations = salesChannels?.[0]?.stock_locations || [];
            locations.forEach((loc: any) => channelLocations.add(loc.id));
        }

        // 3. Get Inventory Levels
        const { data: levels } = await this.query.graph({
            entity: "inventory_level",
            fields: ["location_id", "stocked_quantity", "reserved_quantity", "allow_backorder"],
            filters: { inventory_item_id: inventoryItemId },
        });

        // 4. Select Best Location that satisfies Quantity
        const availableLevels = levels || [];
        
        // Helper to check availability
        const checkStock = (level: any): boolean => {
            if (!level) return false;
            if (level.allow_backorder) return true;
            
            const stocked = level.stocked_quantity || 0;
            const reserved = level.reserved_quantity || 0;
            const available = stocked - reserved;
            
            if (available < quantity) {
                return false;
            }
            return true;
        };

        // Priority 1: Preferred Location
        const preferredMatch = availableLevels.find((l: any) => preferred.has(l.location_id));
        if (preferredMatch) {
            if (checkStock(preferredMatch)) {
                return { inventory_item_id: inventoryItemId, location_id: preferredMatch.location_id };
            }
            // If preferred has insufficient stock, do we fail or try others?
            // Usually we try others, but strict preference might dictate otherwise.
            // For now, let's fallthrough to try channel locations.
        }

        // Priority 2: Sales Channel Location
        const channelMatch = availableLevels.find((l: any) => 
            channelLocations.has(l.location_id) && checkStock(l)
        );
        
        if (channelMatch) {
            return { inventory_item_id: inventoryItemId, location_id: channelMatch.location_id };
        }

        // Fallback: None found with sufficient stock
        const locationFound = availableLevels.find((l: any) => channelLocations.has(l.location_id) || preferred.has(l.location_id));
        
        if (locationFound) {
             // We found a location but it didn't have stock
             this.logger.warn(`Insufficient stock for ${variantId} at valid locations. Availability check failed.`);
             // Throw error here to block order!
             throw new Error(`Insufficient stock for variant ${variantId}. Requested: ${quantity}`);
        }

        this.logger.warn(`No valid fulfillment location found for variant ${variantId}`);
        return null;
    }
}
export default InventoryLocationResolver;
