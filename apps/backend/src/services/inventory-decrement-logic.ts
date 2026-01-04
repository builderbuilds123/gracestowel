import { Logger } from "@medusajs/framework/types";
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

export interface InventoryAdjustment {
    inventory_item_id: string;
    location_id: string;
    stocked_quantity: number;
    previous_stocked_quantity: number;
}

type InjectedDependencies = {
    logger: Logger;
    query: any;
};

export class InventoryDecrementService {
    private logger: Logger;
    private query: any;

    constructor({ logger, query }: InjectedDependencies) {
        this.logger = logger;
        this.query = query;
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

        for (const item of input.cartItems) {
            // Address PR feedback: Fail loudly on missing variant_id
            if (!item.variant_id) {
                throw new Error(`Missing variant_id for cart item. Cannot process inventory decrement.`);
            }

            if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                throw new Error(`Invalid quantity for variant ${item.variant_id}: ${item.quantity}`);
            }

            const { data: variants } = await this.query.graph({
                entity: "product_variant",
                fields: ["inventory_items.inventory_item_id"],
                filters: { id: item.variant_id },
            });

            const inventoryItemId = variants[0]?.inventory_items?.[0]?.inventory_item_id;

            if (!inventoryItemId) {
                throw new InsufficientStockError(item.variant_id, 0, item.quantity);
            }

            const { data: inventoryLevels } = await this.query.graph({
                entity: "inventory_level",
                fields: ["id", "location_id", "stocked_quantity"],
                filters: { inventory_item_id: inventoryItemId },
            });

            if (!inventoryLevels.length) {
                throw new InsufficientStockError(item.variant_id, 0, item.quantity);
            }

            const level = this.resolveTargetLevel(inventoryLevels, preferred, channelLocations);

            if (!level?.location_id) {
                this.logger.error(`[Inventory] No valid fulfillment location found for variant ${item.variant_id}. Preferred: [${Array.from(preferred)}], Channel: [${Array.from(channelLocations)}]`);
                throw new Error(`No valid fulfillment location found for variant ${item.variant_id} (AC3 Violation)`);
            }

            const previousStock = level.stocked_quantity ?? 0;
            const newStock = previousStock - item.quantity; // backorders allowed

            adjustments.push({
                inventory_item_id: inventoryItemId,
                location_id: level.location_id,
                stocked_quantity: newStock,
                previous_stocked_quantity: previousStock,
            });

            this.logger.info(
                `[Inventory] Prepared decrement of ${item.quantity} for item ${inventoryItemId} at location ${level.location_id} (prev: ${previousStock}, next: ${newStock})`
            );
        }

        return adjustments;
    }
}

export default InventoryDecrementService;
