import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

// Import all subscribers
import orderPlacedHandler, {
  config as orderPlacedConfig,
} from "../subscribers/order-placed";
import customerCreatedHandler, {
  config as customerCreatedConfig,
} from "../subscribers/customer-created";
import fulfillmentCreatedHandler, {
  config as fulfillmentCreatedConfig,
} from "../subscribers/fulfillment-created";
import orderCanceledHandler, {
  config as orderCanceledConfig,
} from "../subscribers/order-canceled";

/**
 * Subscriber Loader
 *
 * Manually registers all project subscribers with the event bus.
 * This is necessary because Medusa v2 doesn't auto-discover subscribers
 * in the project's src/subscribers directory.
 */
export default async function subscriberLoader(container: MedusaContainer): Promise<void> {
  console.log("[SubscriberLoader] Registering project subscribers...");

  try {
    // Resolve event bus
    const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

    // Register all subscribers
    const subscribers = [
      { handler: orderPlacedHandler, config: orderPlacedConfig },
      { handler: customerCreatedHandler, config: customerCreatedConfig },
      { handler: fulfillmentCreatedHandler, config: fulfillmentCreatedConfig },
      { handler: orderCanceledHandler, config: orderCanceledConfig },
    ];

    for (const { handler, config } of subscribers) {
      eventBusModuleService.subscribe(config.event, async (data: any) => {
        await handler({ event: { name: config.event, data }, container });
      });
      console.log(`[SubscriberLoader] ✅ Registered subscriber for event: ${config.event}`);
    }

    console.log(`[SubscriberLoader] Successfully registered ${subscribers.length} subscribers`);
  } catch (error) {
    console.error("[SubscriberLoader] Failed to register subscribers:", error);
    throw error;
  }
}
