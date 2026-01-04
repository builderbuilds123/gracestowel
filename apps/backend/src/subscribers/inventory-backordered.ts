import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"

export default async function inventoryBackorderedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve("logger")
  
  const { order_id, items } = data
  
  logger.info(`[Subscriber] Handling inventory.backordered for order ${order_id}`)
  
  for (const item of items) {
    logger.warn(
      `[Backorder] Item ${item.inventory_item_id} at location ${item.location_id} went negative: ${item.stocked_quantity} (prev: ${item.previous_stocked_quantity})`
    )
    
    // AI-NOTE: Here you would typically notify an admin or trigger a purchase order/replenishment workflow.
    // await container.resolve("replenishmentService").trigger(item.inventory_item_id, item.location_id)
  }
}

export const config: SubscriberConfig = {
  event: "inventory.backordered",
}
