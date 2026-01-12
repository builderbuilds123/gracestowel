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
        
        // Use dynamic import for framework utils
        const { Modules } = await import("@medusajs/framework/utils");
        const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

        // Define strict contract for subscriber handlers to ensure type safety
        type SubscriberHandler = (args: {
            event: { name: string; data: any };
            container: MedusaContainer;
            pluginOptions: Record<string, unknown>;
        }) => Promise<void>;

        // Helper to register subscriber
        const registerSubscriber = async (modulePath: string, name: string) => {
             // Dynamic import for subscribers
             const module = await import(modulePath);
             const handler = module.default;
             const config = module.config;
             
             const events = Array.isArray(config.event) ? config.event : [config.event];
             for (const eventName of events) {
                eventBusModuleService.subscribe(eventName, async (data: any) => {
                    const subscriberHandler = handler as unknown as SubscriberHandler;
                    const unwrappedData =
                        data && typeof data === "object" && typeof (data as any).name === "string" && "data" in (data as any)
                            ? (data as any).data
                            : data;

                    await subscriberHandler({ event: { name: eventName, data: unwrappedData }, container, pluginOptions: {} });
                });
                console.log(`[SUBSCRIBERS] ✅ Registered ${name}: ${eventName}`);
             }
        };

        await registerSubscriber("../subscribers/order-placed", "order-placed");
        await registerSubscriber("../subscribers/customer-created", "customer-created");
        await registerSubscriber("../subscribers/fulfillment-created", "fulfillment-created");
        await registerSubscriber("../subscribers/order-canceled", "order-canceled");

        subscribersRegistered = true;
        logger.info("subscribers", "All subscribers registered successfully");
        console.log("[SUBSCRIBERS] All subscribers registered successfully");
    } catch (error) {
        logger.error("subscribers", "Failed to register subscribers", {}, error as Error);
        console.error("[SUBSCRIBERS] Failed to register subscribers:", error);
        throw error;
    }
}
