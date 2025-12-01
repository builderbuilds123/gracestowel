"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveValue = resolveValue;
const utils_1 = require("@medusajs/utils");
const util = __importStar(require("node:util"));
function resolveProperty(property, transactionContext) {
    const { invoke: invokeRes } = transactionContext;
    let res;
    if (property.__type === utils_1.OrchestrationUtils.SymbolInputReference) {
        res = transactionContext.payload;
    }
    else if (property.__type === utils_1.OrchestrationUtils.SymbolMedusaWorkflowResponse) {
        res = resolveValue(property.$result, transactionContext);
    }
    else if (property.__type === utils_1.OrchestrationUtils.SymbolWorkflowStepTransformer) {
        res = property.__resolver(transactionContext);
    }
    else if (property.__type === utils_1.OrchestrationUtils.SymbolWorkflowStep) {
        const output = invokeRes[property.__step__]?.output ?? invokeRes[property.__step__];
        if (output?.__type === utils_1.OrchestrationUtils.SymbolWorkflowStepResponse) {
            res = output.output;
        }
        else {
            res = output;
        }
    }
    else if (property.__type === utils_1.OrchestrationUtils.SymbolWorkflowStepResponse) {
        res = property.output;
    }
    else {
        res = property;
    }
    return res;
}
function unwrapInput({ inputTOUnwrap, parentRef, transactionContext, }) {
    if (inputTOUnwrap == null) {
        return inputTOUnwrap;
    }
    if (Array.isArray(inputTOUnwrap)) {
        const promises = [];
        const resolvedItems = new Array(inputTOUnwrap.length);
        for (let i = 0; i < inputTOUnwrap.length; i++) {
            const item = inputTOUnwrap[i];
            if (item == null || typeof item !== "object") {
                resolvedItems[i] = item;
            }
            else {
                const resolved = resolveValue(item, transactionContext);
                if (resolved instanceof Promise) {
                    promises.push({ promise: resolved, index: i });
                }
                else {
                    resolvedItems[i] = resolved;
                }
            }
        }
        if (promises.length > 0) {
            return (0, utils_1.promiseAll)(promises.map((p) => p.promise)).then((resolvedPromises) => {
                for (let i = 0; i < promises.length; i++) {
                    resolvedItems[promises[i].index] = resolvedPromises[i];
                }
                return resolvedItems;
            });
        }
        return resolvedItems;
    }
    if (util.types.isProxy(inputTOUnwrap)) {
        const resolved = resolveProperty(inputTOUnwrap, transactionContext);
        if (resolved instanceof Promise) {
            return resolved.then((r) => {
                inputTOUnwrap = r;
                if (!(0, utils_1.isObject)(inputTOUnwrap)) {
                    return inputTOUnwrap;
                }
                return unwrapInput({
                    inputTOUnwrap,
                    parentRef: {},
                    transactionContext,
                });
            });
        }
        inputTOUnwrap = resolved;
    }
    if (!(0, utils_1.isObject)(inputTOUnwrap)) {
        return inputTOUnwrap;
    }
    const keys = Object.keys(inputTOUnwrap);
    const promises = [];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (inputTOUnwrap[key] == null || typeof inputTOUnwrap[key] !== "object") {
            parentRef[key] = inputTOUnwrap[key];
            continue;
        }
        const result = resolveProperty(inputTOUnwrap[key], transactionContext);
        if (result instanceof Promise) {
            promises.push({ promise: result, keyIndex: i });
        }
        else {
            parentRef[key] = result;
            if (result != null && typeof result === "object") {
                const unwrapped = unwrapInput({
                    inputTOUnwrap: result,
                    parentRef: {},
                    transactionContext,
                });
                if (unwrapped instanceof Promise) {
                    promises.push({
                        promise: unwrapped.then((r) => ({ key, value: r })),
                        keyIndex: i,
                    });
                }
                else {
                    parentRef[key] = unwrapped;
                }
            }
        }
    }
    if (promises.length > 0) {
        return (0, utils_1.promiseAll)(promises.map((p) => p.promise)).then((resolvedPromises) => {
            for (let i = 0; i < promises.length; i++) {
                const resolved = resolvedPromises[i];
                if (resolved && typeof resolved === "object" && "key" in resolved) {
                    parentRef[resolved.key] = resolved.value;
                }
                else {
                    const key = keys[promises[i].keyIndex];
                    parentRef[key] = resolved;
                    if (resolved != null && typeof resolved === "object") {
                        const unwrapped = unwrapInput({
                            inputTOUnwrap: resolved,
                            parentRef: {},
                            transactionContext,
                        });
                        if (unwrapped instanceof Promise) {
                            return unwrapped.then((r) => {
                                parentRef[key] = r;
                                return parentRef;
                            });
                        }
                        parentRef[key] = unwrapped;
                    }
                }
            }
            return parentRef;
        });
    }
    return parentRef;
}
function resolveValue(input, transactionContext) {
    if (input == null || typeof input !== "object") {
        return input;
    }
    const input_ = input?.__type ===
        utils_1.OrchestrationUtils.SymbolWorkflowWorkflowData
        ? input.output
        : input;
    let result;
    if (input_?.__type) {
        result = resolveProperty(input_, transactionContext);
        if (result instanceof Promise) {
            return result.then((r) => (0, utils_1.parseStringifyIfNecessary)(r));
        }
        return (0, utils_1.parseStringifyIfNecessary)(result);
    }
    else {
        result = unwrapInput({
            inputTOUnwrap: input_,
            parentRef: {},
            transactionContext,
        });
        if (result instanceof Promise) {
            return result.then((r) => (0, utils_1.parseStringifyIfNecessary)(r));
        }
        return (0, utils_1.parseStringifyIfNecessary)(result);
    }
}
//# sourceMappingURL=resolve-value.js.map