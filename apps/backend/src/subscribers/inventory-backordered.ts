import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"

/**
 * Event payload for inventory.backordered events
 * Emitted when an inventory decrement results in negative stock (backorder)
 *
 * AC3 (INV-02): Backorder event emission with required fields
 */
interface BackorderedItem {
    variant_id: string;
    inventory_item_id: string;
    location_id: string;
    delta: number;           // Quantity decremented
    new_stock: number;       // Resulting stock level (negative for backorders)
    previous_stocked_quantity: number;
    available_quantity: number;
}

interface InventoryBackorderedEventData {
    order_id: string;
    items: BackorderedItem[];
}

/**
 * Subscriber: inventory.backordered
 *
 * Handles inventory backorder events when stock goes negative.
 * This subscriber logs the backorder for monitoring and can be extended
 * to trigger replenishment workflows or admin notifications.
 *
 * @see AC3 (INV-02): Backorder event emission
 */
export default async function inventoryBackorderedSubscriber({
    event: { data },
    container,
}: SubscriberArgs<InventoryBackorderedEventData>) {
    const logger = container.resolve("logger")

    // Validate event data structure
    if (!data || !data.order_id || !Array.isArray(data.items) || data.items.length === 0) {
        logger.error(`[Subscriber][inventory.backordered] Invalid or empty event data: ${JSON.stringify(data)}`)
        return
    }

    const validItems = data.items.filter(item => 
        item.inventory_item_id && item.location_id && typeof item.new_stock === 'number'
    );

    if (validItems.length !== data.items.length) {
        logger.warn(`[Subscriber][inventory.backordered] Some items in event for order ${data.order_id} were invalid. Total: ${data.items.length}, Invalid: ${data.items.length - validItems.length}`);
    }

    if (validItems.length === 0) {
        logger.warn(`[Subscriber][inventory.backordered] No valid items in backorder event for order ${data.order_id}`);
        return;
    }

    logger.info(`[Subscriber] Handling inventory.backordered for order ${data.order_id} (${data.items.length} items)`)

    try {
        for (const item of data.items) {
            logger.warn(
                `[Backorder] Item ${item.inventory_item_id} at location ${item.location_id} went negative: ` +
                `new_stock=${item.new_stock}, delta=${item.delta}, previous=${item.previous_stocked_quantity}`
            )
        }

        // Send admin notification for inventory backorder alert
        await sendAdminNotification(container, {
            type: AdminNotificationType.INVENTORY_BACKORDER,
            title: "Inventory Backorder Alert",
            description: `${validItems.length} item(s) backordered for order ${data.order_id}`,
            metadata: {
                order_id: data.order_id,
                item_count: validItems.length,
                items: validItems.map(item => ({
                    inventory_item_id: item.inventory_item_id,
                    new_stock: item.new_stock,
                })),
            },
        })

        logger.info(`[Subscriber] inventory.backordered processed successfully for order ${data.order_id}`)
    } catch (error) {
        // Log error but don't throw - subscriber failures shouldn't block order processing
        logger.error(
            `[Subscriber][inventory.backordered] Error processing backorder for order ${data.order_id}:`,
            error instanceof Error ? error.message : error
        )
    }
}

export const config: SubscriberConfig = {
    event: "inventory.backordered",
}
