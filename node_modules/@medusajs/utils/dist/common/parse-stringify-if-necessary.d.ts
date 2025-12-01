/**
 * Creates a deep copy of the input, ensuring it's JSON-serializable.
 * - Breaks all reference sharing (creates new objects/arrays)
 * - Removes non-serializable values (functions, symbols, undefined properties)
 * - Normalizes special types (Date -> string)
 * - Only stringifies special objects, not entire tree (optimization)
 * @param result
 * @returns A deep copy with no shared references, guaranteed to be JSON-serializable
 */
export declare function parseStringifyIfNecessary(result: unknown): any;
//# sourceMappingURL=parse-stringify-if-necessary.d.ts.map