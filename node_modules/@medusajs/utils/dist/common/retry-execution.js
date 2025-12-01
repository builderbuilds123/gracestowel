"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryExecution = retryExecution;
const promises_1 = require("timers/promises");
const ONE_SECOND = 1000;
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
async function retryExecution(fn, options = {
    shouldRetry: () => true,
    onRetry: () => { },
    maxRetries: 5,
    retryDelay: ONE_SECOND,
}) {
    let { shouldRetry, onRetry, maxRetries, retryDelay } = options;
    shouldRetry = shouldRetry ?? (() => true);
    maxRetries = maxRetries ?? 5;
    onRetry = onRetry ?? (() => { });
    const retryDelayFn = typeof retryDelay === "function"
        ? retryDelay
        : (retries, maxRetries) => retryDelay;
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await fn();
        }
        catch (error) {
            if (!shouldRetry(error)) {
                throw error;
            }
            retries++;
            if (retries === maxRetries) {
                throw error;
            }
            onRetry(error);
            await (0, promises_1.setTimeout)(retryDelayFn(retries, maxRetries));
        }
    }
    // This should never be reached
    throw new Error("Retry execution failed. Max retries reached.");
}
//# sourceMappingURL=retry-execution.js.map