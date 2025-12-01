"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _BaseStepErrror_stepResponse, _SkipCancelledExecutionError___type;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkipCancelledExecutionError = exports.SkipStepAlreadyFinishedError = exports.SkipExecutionError = exports.NonSerializableCheckPointError = exports.TransactionTimeoutError = exports.TransactionStepTimeoutError = exports.SkipStepResponse = exports.PermanentStepFailureError = void 0;
const utils_1 = require("@medusajs/utils");
class BaseStepErrror extends Error {
    constructor(name, message, stepResponse) {
        super(message);
        _BaseStepErrror_stepResponse.set(this, void 0);
        this.name = name;
        __classPrivateFieldSet(this, _BaseStepErrror_stepResponse, stepResponse, "f");
    }
    getStepResponse() {
        return __classPrivateFieldGet(this, _BaseStepErrror_stepResponse, "f");
    }
}
_BaseStepErrror_stepResponse = new WeakMap();
class PermanentStepFailureError extends BaseStepErrror {
    static isPermanentStepFailureError(error) {
        return (error instanceof PermanentStepFailureError ||
            error?.name === "PermanentStepFailure");
    }
    constructor(message, stepResponse) {
        super("PermanentStepFailure", message, stepResponse);
    }
}
exports.PermanentStepFailureError = PermanentStepFailureError;
class SkipStepResponse extends BaseStepErrror {
    static isSkipStepResponse(error) {
        return (error instanceof SkipStepResponse || error?.name === "SkipStepResponse");
    }
    constructor(message, stepResponse) {
        super("SkipStepResponse", message, stepResponse);
    }
}
exports.SkipStepResponse = SkipStepResponse;
class TransactionStepTimeoutError extends BaseStepErrror {
    static isTransactionStepTimeoutError(error) {
        return (error instanceof TransactionStepTimeoutError ||
            error?.name === "TransactionStepTimeoutError");
    }
    constructor(message, stepResponse) {
        super("TransactionStepTimeoutError", message, stepResponse);
    }
}
exports.TransactionStepTimeoutError = TransactionStepTimeoutError;
class TransactionTimeoutError extends BaseStepErrror {
    static isTransactionTimeoutError(error) {
        return (error instanceof TransactionTimeoutError ||
            error?.name === "TransactionTimeoutError");
    }
    constructor(message, stepResponse) {
        super("TransactionTimeoutError", message, stepResponse);
    }
}
exports.TransactionTimeoutError = TransactionTimeoutError;
class NonSerializableCheckPointError extends Error {
    static isNonSerializableCheckPointError(error) {
        return (error instanceof NonSerializableCheckPointError ||
            error?.name === "NonSerializableCheckPointError");
    }
    constructor(message) {
        super(message);
        this.name = "NonSerializableCheckPointError";
    }
}
exports.NonSerializableCheckPointError = NonSerializableCheckPointError;
class SkipExecutionError extends Error {
    static isSkipExecutionError(error) {
        return (error instanceof SkipExecutionError ||
            error?.name === "SkipExecutionError");
    }
    constructor(message) {
        super(message);
        this.name = "SkipExecutionError";
    }
}
exports.SkipExecutionError = SkipExecutionError;
class SkipStepAlreadyFinishedError extends Error {
    static isSkipStepAlreadyFinishedError(error) {
        return (error instanceof SkipStepAlreadyFinishedError ||
            error?.name === "SkipStepAlreadyFinishedError");
    }
    constructor(message) {
        super(message);
        this.name = "SkipStepAlreadyFinishedError";
    }
}
exports.SkipStepAlreadyFinishedError = SkipStepAlreadyFinishedError;
class SkipCancelledExecutionError extends Error {
    get __type() {
        return __classPrivateFieldGet(this, _SkipCancelledExecutionError___type, "f");
    }
    static isSkipCancelledExecutionError(error) {
        return (error instanceof SkipCancelledExecutionError ||
            error?.name === "SkipCancelledExecutionError");
    }
    constructor(message) {
        super(message);
        _SkipCancelledExecutionError___type.set(this, utils_1.OrchestrationUtils.SymbolWorkflowStepResponse);
        this.name = "SkipCancelledExecutionError";
    }
}
exports.SkipCancelledExecutionError = SkipCancelledExecutionError;
_SkipCancelledExecutionError___type = new WeakMap();
//# sourceMappingURL=errors.js.map