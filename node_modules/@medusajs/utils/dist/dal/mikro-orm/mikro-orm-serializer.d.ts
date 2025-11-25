import { EntityDTO, Loaded } from "@medusajs/deps/mikro-orm/core";
declare const STATIC_OPTIONS_SHAPE: {
    populate: string[] | boolean;
    exclude: string[] | undefined;
    preventCircularRef: boolean;
    skipNull: boolean | undefined;
    ignoreSerializers: boolean | undefined;
    forceObject: boolean;
};
declare class RequestScopedSerializationContext {
    readonly propertyNameCache: Map<string, string>;
    readonly visitedEntities: WeakSet<object>;
    readonly keyCollectionBuffer: string[];
    keyBufferIndex: number;
    constructor();
    resetKeyBuffer(): void;
    addKey(key: string): void;
    getKeys(): string[];
}
export declare class EntitySerializer {
    static serialize<T extends object, P extends string = never>(entity: T, options?: Partial<typeof STATIC_OPTIONS_SHAPE>, parents?: readonly string[], requestCtx?: RequestScopedSerializationContext): EntityDTO<Loaded<T, P>>;
    private static propertyName;
    private static processProperty;
    private static extractChildPopulate;
    private static createChildOptions;
    private static processEntity;
    private static processCollection;
}
export declare const mikroOrmSerializer: <TOutput extends object>(data: any, options?: Partial<Parameters<typeof EntitySerializer.serialize>[1] & {
    preventCircularRef: boolean | undefined;
    populate: string[] | boolean | undefined;
}>) => TOutput;
export {};
//# sourceMappingURL=mikro-orm-serializer.d.ts.map