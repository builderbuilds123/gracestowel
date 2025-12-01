import { Context, ModulesSdkTypes } from "@medusajs/types";
import { MedusaMikroOrmEventSubscriber } from "./create-medusa-mikro-orm-event-subscriber";
type InternalService = {
    new <TContainer extends object = object, TEntity extends object = any>(container: TContainer): ModulesSdkTypes.IMedusaInternalService<TEntity, TContainer>;
    setEventSubscriber(subscriber: MedusaMikroOrmEventSubscriber): void;
};
export declare function registerInternalServiceEventSubscriber(context: Context, subscriber?: MedusaMikroOrmEventSubscriber): void;
export declare const MedusaInternalServiceSymbol: unique symbol;
/**
 * Check if a value is a Medusa internal service
 * @param value
 */
export declare function isMedusaInternalService(value: any): value is InternalService;
export declare function MedusaInternalService<TContainer extends object = object, TEntity extends object = any>(rawModel: any): InternalService;
export {};
//# sourceMappingURL=medusa-internal-service.d.ts.map