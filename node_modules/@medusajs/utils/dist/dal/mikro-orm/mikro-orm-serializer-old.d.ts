/**
 * This is an optimized mikro orm serializer to create a highly optimized serialization pipeline
 * that leverages V8's JIT compilation and inline caching mechanisms.
 */
import { EntityDTO, Loaded } from "@mikro-orm/core";
declare const STATIC_OPTIONS_SHAPE: {
    populate: string[] | boolean | undefined;
    exclude: string[] | undefined;
    preventCircularRef: boolean | undefined;
    skipNull: boolean | undefined;
    ignoreSerializers: boolean | undefined;
    forceObject: boolean | undefined;
};
export declare class EntitySerializer {
    private static readonly PROPERTY_CACHE_SIZE;
    static serialize<T extends object, P extends string = never>(entity: T, options?: Partial<typeof STATIC_OPTIONS_SHAPE>, parents?: string[]): EntityDTO<Loaded<T, P>>;
    private static propertyNameCache;
    private static propertyName;
    private static processProperty;
    private static extractChildOptions;
    private static processEntity;
    private static processCollection;
}
export declare const mikroOrmSerializer: <TOutput extends object>(data: any, options?: Partial<Parameters<typeof EntitySerializer.serialize>[1] & {
    preventCircularRef: boolean | undefined;
    populate: string[] | boolean | undefined;
}>) => Promise<TOutput>;
export {};
//# sourceMappingURL=mikro-orm-serializer-old.d.ts.map