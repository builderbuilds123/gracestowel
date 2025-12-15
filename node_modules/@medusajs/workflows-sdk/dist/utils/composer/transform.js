"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transform = transform;
const utils_1 = require("@medusajs/utils");
const helpers_1 = require("./helpers");
const proxy_1 = require("./helpers/proxy");
function transform(values, ...functions) {
    const uniqId = Math.random().toString(36).substring(2, 20);
    const ret = {
        __id: uniqId,
        __type: utils_1.OrchestrationUtils.SymbolWorkflowStepTransformer,
    };
    const returnFn = async function (
    // If a transformer is returned as the result of a workflow, then at this point the workflow is entirely done, in that case we have a TransactionContext
    transactionContext) {
        if ("transaction" in transactionContext) {
            const temporaryDataKey = `${transactionContext.transaction.modelId}_${transactionContext.transaction.transactionId}_${uniqId}`;
            ret.__temporary_storage_key ??= temporaryDataKey;
            if (transactionContext.transaction.hasTemporaryData(ret.__temporary_storage_key)) {
                return transactionContext.transaction.getTemporaryData(ret.__temporary_storage_key);
            }
        }
        let stepValue = (0, helpers_1.resolveValue)(values, transactionContext);
        if (stepValue instanceof Promise) {
            stepValue = await stepValue;
        }
        let finalResult;
        for (let i = 0; i < functions.length; i++) {
            const fn = functions[i];
            const arg = i === 0 ? stepValue : finalResult;
            finalResult = fn.apply(fn, [arg, transactionContext]);
            if (finalResult instanceof Promise) {
                finalResult = await finalResult;
            }
        }
        if ("transaction" in transactionContext) {
            const temporaryDataKey = ret.__temporary_storage_key;
            transactionContext.transaction.setTemporaryData(temporaryDataKey, finalResult);
        }
        return finalResult;
    };
    const proxyfiedRet = (0, proxy_1.proxify)(ret);
    proxyfiedRet.__resolver = returnFn;
    proxyfiedRet.__temporary_storage_key = null;
    return proxyfiedRet;
}
//# sourceMappingURL=transform.js.map