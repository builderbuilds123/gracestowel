import { Logger } from "@medusajs/framework/types";
import { clampAvailability } from "../lib/inventory/availability";
import { InsufficientStockError } from "../workflows/add-item-to-order";

export interface CartItemForInventory {
    variant_id: string;
    quantity: number;
}

export interface AtomicInventoryInput {
    cartItems: CartItemForInventory[];
    preferredLocationIds?: string[];
    salesChannelId?: string | null;
}

/**
 * Represents an inventory adjustment prepared for decrement.
 * Used by the workflow to apply inventory level updates atomically.
 *
 * @see AC1-AC7 (INV-02): Backorder logic with negative inventory support
 */
export interface InventoryAdjustment {
    /** The product variant being adjusted */
    variant_id: string;
    /** The inventory item ID in Medusa's inventory module */
    inventory_item_id: string;
    /** The stock location where inventory is being decremented */
    location_id: string;
    /** The new stock level after decrement (may be negative if allow_backorder=true) */
    stocked_quantity: number;
    /** The stock level before this decrement */
    previous_stocked_quantity: number;
    /** The clamped availability for storefront display (always >= 0) */
    available_quantity: number;
}

type InjectedDependencies = {
    logger: Logger;
    query: any;
    pg_connection: any;
};

export class InventoryDecrementService {
    private logger: Logger;
    private query: any;
    private pgConnection: any;

    constructor({ logger, query, pg_connection }: InjectedDependencies) {
        this.logger = logger;
        this.query = query;
        this.pgConnection = pg_connection;
    }

    async getSalesChannelLocationIds(salesChannelId?: string | null): Promise<string[]> {
        if (!salesChannelId) return [];
        try {
            const { data: salesChannels } = await this.query.graph({
                entity: "sales_channel",
                fields: ["stock_locations.stock_location_id"],
                filters: { id: salesChannelId },
            });
            const channel = salesChannels?.[0];
            const locations = channel?.stock_locations || [];
            return locations
                .map((loc: any) => loc?.stock_location_id)
                .filter((id: string | undefined): id is string => Boolean(id));
        } catch (err) {
            this.logger.error(
                `[Inventory] Failed to resolve stock locations for sales channel ${salesChannelId}: ${err instanceof Error ? err.message : err}`
            );
            throw new Error(`Failed to resolve stock locations for sales channel ${salesChannelId}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    resolveTargetLevel(
        levels: any[],
        preferredIds: Set<string>,
        channelIds: Set<string>
    ) {
        const byPreferred = levels.find((lvl) => preferredIds.has(lvl.location_id));
        if (byPreferred) return byPreferred;
        const byChannel = levels.find((lvl) => channelIds.has(lvl.location_id));
        if (byChannel) return byChannel;
        // AC3: Removed arbitrary fallback to prevent shipping from unmapped locations
        return null;
    }

    async atomicDecrementInventory(input: AtomicInventoryInput): Promise<InventoryAdjustment[]> {
        const preferred = new Set<string>(input.preferredLocationIds?.filter(Boolean) ?? []);
        const channelLocations = new Set<string>(
            await this.getSalesChannelLocationIds(input.salesChannelId)
        );
        const adjustments: InventoryAdjustment[] = [];

        // 1. Pre-validation and ID collection
        const variantIds = new Set<string>();
        for (const item of input.cartItems) {
            if (!item.variant_id) {
                throw new Error(`Missing variant_id for cart item.`);
            }
            if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                throw new Error(`Invalid quantity for variant ${item.variant_id}: ${item.quantity}`);
            }
            variantIds.add(item.variant_id);
        }

        // 2. Batch fetch variants mapping to inventory items
        const { data: variants } = await this.query.graph({
            entity: "product_variant",
            fields: ["id", "inventory_items.inventory_item_id"],
            filters: { id: Array.from(variantIds) },
        });

        const variantMap = new Map<string, string>(); // variant_id -> inventory_item_id
        for (const v of variants) {
            const invItemId = v.inventory_items?.[0]?.inventory_item_id;
            if (invItemId) {
                variantMap.set(v.id, invItemId);
            }
        }

        // 3. Batch fetch all relevant inventory levels
        const inventoryItemIds = Array.from(variantMap.values());
        if (inventoryItemIds.length === 0) {
             // If no inventory items found for any variant, fail early or let loop handle it
        }

        const { data: allLevels } = await this.query.graph({
            entity: "inventory_level",
            fields: ["id", "location_id", "stocked_quantity", "inventory_item_id"],
            filters: { inventory_item_id: inventoryItemIds },
        });

        // Map: inventory_item_id -> levels[]
        const levelsByItem = new Map<string, any[]>();
        const allLevelIds: string[] = [];
        
        for (const lvl of allLevels) {
            const list = levelsByItem.get(lvl.inventory_item_id) || [];
            list.push(lvl);
            levelsByItem.set(lvl.inventory_item_id, list);
            allLevelIds.push(lvl.id);
        }

        // 4. Batch fetch 'allow_backorder' flags for ALL resolved levels
        // This avoids N+1 queries inside the loop
        let allowBackorderMap = new Map<string, boolean>(); // level_id -> boolean
        if (allLevelIds.length > 0) {
            const levelDetails = await this.pgConnection("inventory_level")
                .whereIn("id", allLevelIds)
                .select("id", "allow_backorder");
            
            for (const details of levelDetails) {
                 allowBackorderMap.set(details.id, details?.allow_backorder ?? false);
            }
        }

        // 5. Process decrements
        for (const item of input.cartItems) {
            const inventoryItemId = variantMap.get(item.variant_id);
            if (!inventoryItemId) {
                throw new InsufficientStockError(item.variant_id, 0, item.quantity);
            }

            const levels = levelsByItem.get(inventoryItemId) || [];
            if (levels.length === 0) {
                throw new InsufficientStockError(item.variant_id, 0, item.quantity);
            }

            const level = this.resolveTargetLevel(levels, preferred, channelLocations);

            if (!level?.location_id) {
                this.logger.error(`[Inventory] No valid fulfillment location found for variant ${item.variant_id}. Preferred: [${Array.from(preferred)}], Channel: [${Array.from(channelLocations)}]`);
                throw new Error(`No valid fulfillment location found for variant ${item.variant_id} (AC3 Violation)`);
            }

            // Use pre-fetched flag
            const allowBackorder = allowBackorderMap.get(level.id) ?? false;

            const previousStock = level.stocked_quantity ?? 0;
            const newStock = previousStock - item.quantity;

            // AC2 & AC7: Enforce stock check if backorders are NOT allowed
            if (!allowBackorder && newStock < 0) {
                this.logger.warn(
                    `[Inventory] Insufficient stock for ${item.variant_id} at ${level.location_id}: requested ${item.quantity}, available ${previousStock}`
                );
                throw new InsufficientStockError(item.variant_id, previousStock, item.quantity);
            }

            adjustments.push({
                variant_id: item.variant_id,
                inventory_item_id: inventoryItemId,
                location_id: level.location_id,
                stocked_quantity: newStock,
                previous_stocked_quantity: previousStock,
                available_quantity: clampAvailability(newStock),
            });

            this.logger.info(
                `[Inventory] Prepared decrement of ${item.quantity} for item ${inventoryItemId} at location ${level.location_id} (prev: ${previousStock}, next: ${newStock}, backorder: ${allowBackorder})`
            );
        }

        return adjustments;
    }
}

export default InventoryDecrementService;
