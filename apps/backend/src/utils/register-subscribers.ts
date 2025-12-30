import { MedusaContainer } from "@medusajs/framework/types";
import { logger } from "./logger";

let subscribersRegistered = false;

/**
 * Register all project subscribers
 * Medusa v2 doesn't auto-discover project-level subscribers, so we register them manually
 */
export async function registerProjectSubscribers(container: MedusaContainer): Promise<void> {
    if (process.env.ENABLE_MANUAL_SUBSCRIBERS !== "true") {
        return;
    }

    if (subscribersRegistered) {
        return;
    }

    try {
        logger.info("subscribers", "Registering project subscribers...");
        console.log("[SUBSCRIBERS] Registering project subscribers...");
        const { Modules } = require("@medusajs/framework/utils");
        const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

        // Define strict contract for subscriber handlers to ensure type safety
        type SubscriberHandler = (args: {
            event: { name: string; data: any };
            container: MedusaContainer;
            pluginOptions: Record<string, unknown>;
        }) => Promise<void>;

        // Use require for CommonJS compatibility in Medusa development mode
        const orderPlacedModule = require("../subscribers/order-placed");
        const orderPlacedHandler = orderPlacedModule.default;
        const orderPlacedConfig = orderPlacedModule.config;

        const orderPlacedEvents = Array.isArray(orderPlacedConfig.event) ? orderPlacedConfig.event : [orderPlacedConfig.event];
        for (const eventName of orderPlacedEvents) {
            eventBusModuleService.subscribe(eventName, async (data: any) => {
                const handler = orderPlacedHandler as unknown as SubscriberHandler;
                const unwrappedData =
                    data && typeof data === "object" && typeof (data as any).name === "string" && "data" in (data as any)
                        ? (data as any).data
                        : data;

                await handler({ event: { name: eventName, data: unwrappedData }, container, pluginOptions: {} });
            });
            console.log(`[SUBSCRIBERS] ✅ Registered: ${eventName}`);
        }

        // Import and register customer-created subscriber
        const customerCreatedModule = require("../subscribers/customer-created");
        const customerCreatedHandler = customerCreatedModule.default;
        const customerCreatedConfig = customerCreatedModule.config;

        const customerCreatedEvents = Array.isArray(customerCreatedConfig.event) ? customerCreatedConfig.event : [customerCreatedConfig.event];
        for (const eventName of customerCreatedEvents) {
            eventBusModuleService.subscribe(eventName, async (data: any) => {
                const handler = customerCreatedHandler as unknown as SubscriberHandler;
                await handler({ event: { name: eventName, data }, container, pluginOptions: {} });
            });
            console.log(`[SUBSCRIBERS] ✅ Registered: ${eventName}`);
        }

        // Import and register fulfillment-created subscriber
        const fulfillmentCreatedModule = require("../subscribers/fulfillment-created");
        const fulfillmentCreatedHandler = fulfillmentCreatedModule.default;
        const fulfillmentCreatedConfig = fulfillmentCreatedModule.config;

        const fulfillmentEvents = Array.isArray(fulfillmentCreatedConfig.event) ? fulfillmentCreatedConfig.event : [fulfillmentCreatedConfig.event];
        for (const eventName of fulfillmentEvents) {
            eventBusModuleService.subscribe(eventName, async (data: any) => {
                const handler = fulfillmentCreatedHandler as unknown as SubscriberHandler;
                await handler({ event: { name: eventName, data }, container, pluginOptions: {} });
            });
            console.log(`[SUBSCRIBERS] ✅ Registered: ${eventName}`);
        }

        // Import and register order-canceled subscriber
        const orderCanceledModule = require("../subscribers/order-canceled");
        const orderCanceledHandler = orderCanceledModule.default;
        const orderCanceledConfig = orderCanceledModule.config;

        const orderCanceledEvents = Array.isArray(orderCanceledConfig.event) ? orderCanceledConfig.event : [orderCanceledConfig.event];
        for (const eventName of orderCanceledEvents) {
            eventBusModuleService.subscribe(eventName, async (data: any) => {
                const handler = orderCanceledHandler as unknown as SubscriberHandler;
                await handler({ event: { name: eventName, data }, container, pluginOptions: {} });
            });
            console.log(`[SUBSCRIBERS] ✅ Registered: ${eventName}`);
        }

        subscribersRegistered = true;
        logger.info("subscribers", "All subscribers registered successfully");
        console.log("[SUBSCRIBERS] All subscribers registered successfully");
    } catch (error) {
        logger.error("subscribers", "Failed to register subscribers", {}, error as Error);
        console.error("[SUBSCRIBERS] Failed to register subscribers:", error);
        throw error;
    }
}
