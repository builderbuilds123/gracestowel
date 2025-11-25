"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWithConcurrency = executeWithConcurrency;
const promise_all_1 = require("./promise-all");
/**
 * Execute functions with a concurrency limit
 * @param functions Array of functions to execute in parallel
 * @param concurrency Maximum number of concurrent executions
 */
async function executeWithConcurrency(functions, concurrency) {
    const functionsLength = functions.length;
    const results = new Array(functionsLength);
    let currentIndex = 0;
    const executeNext = async () => {
        while (currentIndex < functionsLength) {
            const index = currentIndex++;
            const result = await Promise.allSettled([functions[index]()]);
            results[index] = result[0];
        }
    };
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, functionsLength); i++) {
        workers.push(executeNext());
    }
    await (0, promise_all_1.promiseAll)(workers);
    return results;
}
//# sourceMappingURL=execute-with-concurrency.js.map