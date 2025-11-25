import { ICachingModuleService, MedusaContainer } from "@medusajs/types";
/**
 * This function is used to cache the result of a function call.
 *
 * @param cb - The callback to execute.
 * @param options - The options for the cache.
 * @returns The result of the callback.
 */
export declare function useCache<T>(cb: (...args: any[]) => Promise<T>, options: {
    enable?: boolean;
    key: string | any[];
    tags?: string[];
    ttl?: number;
    /**
     * Whethere the default strategy should auto invalidate the cache whenever it is possible.
     */
    autoInvalidate?: boolean;
    providers?: string[];
    container: MedusaContainer;
}): Promise<T>;
type TargetMethodArgs<Target, PropertyKey> = Target[PropertyKey & keyof Target] extends (...args: any[]) => any ? Parameters<Target[PropertyKey & keyof Target]> : never;
/**
 * This function is used to cache the result of a method call.
 *
 * @param options - The options for the cache.
 * @returns The original method with the cache applied.
 */
export declare function Cached<const Target extends object, const PropertyKey extends keyof Target>(options: {
    /**
     * The key to use for the cache.
     * If a function is provided, it will be called with the arguments as the first argument and the
     * container as the second argument.
     */
    key?: string | ((args: TargetMethodArgs<Target, PropertyKey>, cachingModule: ICachingModuleService) => string | Promise<string> | Promise<any[]> | any[]);
    /**
     * Whether to enable the cache. This is only useful if you want to enable without providing any
     * other options.
     */
    enable?: boolean | ((args: TargetMethodArgs<Target, PropertyKey>) => boolean | undefined);
    /**
     * The tags to use for the cache.
     */
    tags?: string[] | ((args: TargetMethodArgs<Target, PropertyKey>) => string[] | undefined);
    /**
     * The time-to-live (TTL) value in seconds.
     */
    ttl?: number | ((args: TargetMethodArgs<Target, PropertyKey>) => number | undefined);
    /**
     * Whether to auto invalidate the cache whenever it is possible.
     */
    autoInvalidate?: boolean | ((args: TargetMethodArgs<Target, PropertyKey>) => boolean | undefined);
    /**
     * The providers to use for the cache.
     */
    providers?: string[] | ((args: TargetMethodArgs<Target, PropertyKey>) => string[] | undefined);
    container: MedusaContainer | ((this: Target) => MedusaContainer);
}): (target: Target, propertyKey: PropertyKey, descriptor: PropertyDescriptor) => PropertyDescriptor;
export {};
//# sourceMappingURL=index.d.ts.map