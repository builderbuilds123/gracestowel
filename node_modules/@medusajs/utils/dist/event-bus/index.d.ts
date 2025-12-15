import { EventBusTypes, InterceptorSubscriber, InternalModuleDeclaration } from "@medusajs/types";
export declare abstract class AbstractEventBusModuleService implements EventBusTypes.IEventBusModuleService {
    protected isWorkerMode: boolean;
    protected eventToSubscribersMap_: Map<string | symbol, EventBusTypes.SubscriberDescriptor[]>;
    protected interceptorSubscribers_: Set<InterceptorSubscriber>;
    get eventToSubscribersMap(): Map<string | symbol, EventBusTypes.SubscriberDescriptor[]>;
    protected constructor(cradle: Record<string, unknown>, moduleOptions: {} | undefined, moduleDeclaration: InternalModuleDeclaration);
    abstract emit<T>(data: EventBusTypes.Message<T> | EventBusTypes.Message<T>[], options: Record<string, unknown>): Promise<void>;
    abstract releaseGroupedEvents(eventGroupId: string): Promise<void>;
    abstract clearGroupedEvents(eventGroupId: string, options?: {
        eventNames?: string[];
    }): Promise<void>;
    protected storeSubscribers({ event, subscriberId, subscriber, }: {
        event: string | symbol;
        subscriberId: string;
        subscriber: EventBusTypes.Subscriber;
    }): void;
    subscribe(eventName: string | symbol, subscriber: EventBusTypes.Subscriber, context?: EventBusTypes.SubscriberContext): this;
    unsubscribe(eventName: string | symbol, subscriber: EventBusTypes.Subscriber, context?: EventBusTypes.SubscriberContext): this;
    /**
     * Add an interceptor subscriber that receives all messages before they are emitted
     *
     * @param interceptor - Function that receives messages before emission
     * @returns this for chaining
     */
    addInterceptor(interceptor: InterceptorSubscriber): this;
    /**
     * Remove an interceptor subscriber
     *
     * @param interceptor - Function to remove from interceptors
     * @returns this for chaining
     */
    removeInterceptor(interceptor: InterceptorSubscriber): this;
    /**
     * Call all interceptor subscribers with the message before emission
     * This should be called by implementations before emitting events
     *
     * @param message - The message to be intercepted
     * @param context - Optional context about the emission
     */
    protected callInterceptors<T = unknown>(message: EventBusTypes.Message<T>, context?: {
        isGrouped?: boolean;
        eventGroupId?: string;
    }): Promise<void>;
}
export * from "./build-event-messages";
export * from "./common-events";
export * from "./message-aggregator";
export * from "./utils";
//# sourceMappingURL=index.d.ts.map