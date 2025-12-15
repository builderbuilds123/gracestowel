/**
 * Retry the function to be executed until it succeeds or the max retries is reached.
 *
 * @param fn - The function to be executed.
 * @param options - The options for the retry execution.
 * @param options.shouldRetry - The function to determine if the function should be retried based on the error argument.
 * @param options.maxRetries - The maximum number of retries.
 * @param options.retryDelay - The delay between retries. If a function is provided, it will be called with the current retry count and the maximum number of retries and should return the delay in milliseconds.
 * @param options.onRetry - The function to be called when the function fails to execute.
 * @returns The result of the function.
 */
export declare function retryExecution<T>(fn: () => Promise<T>, options?: {
    shouldRetry?: (error: any) => boolean;
    onRetry?: (error: any) => void;
    maxRetries?: number;
    retryDelay?: number | ((retries: number, maxRetries: number) => number);
}): Promise<T>;
//# sourceMappingURL=retry-execution.d.ts.map