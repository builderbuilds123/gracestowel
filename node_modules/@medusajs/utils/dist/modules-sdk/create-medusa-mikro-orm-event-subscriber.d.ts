import { Context } from "@medusajs/types";
import { EventArgs, EventSubscriber } from "@mikro-orm/core";
type Service = {
    interceptEntityMutationEvents: (event: "afterCreate" | "afterUpdate" | "afterUpsert" | "afterDelete", args: EventArgs<any>, context: Context) => void;
};
export type MedusaMikroOrmEventSubscriber = {
    new (context: Context): EventSubscriber;
};
/**
 * Build a new mikro orm event subscriber for the given models
 * @param models
 * @returns
 */
export declare function createMedusaMikroOrmEventSubscriber(keys: string[], service: Service): MedusaMikroOrmEventSubscriber;
export {};
//# sourceMappingURL=create-medusa-mikro-orm-event-subscriber.d.ts.map