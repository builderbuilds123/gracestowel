/**
 * Execute functions with a concurrency limit
 * @param functions Array of functions to execute in parallel
 * @param concurrency Maximum number of concurrent executions
 */
export declare function executeWithConcurrency<T>(functions: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<Awaited<T>>[]>;
//# sourceMappingURL=execute-with-concurrency.d.ts.map