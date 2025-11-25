"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _a, _TransactionCheckpoint_ALLOWED_STATE_TRANSITIONS, _TransactionCheckpoint_ALLOWED_STATUS_TRANSITIONS, _TransactionCheckpoint_mergeFlow, _TransactionCheckpoint_shouldUpdateStepState, _TransactionCheckpoint_mergeErrors, _DistributedTransaction_instances, _DistributedTransaction_temporaryStorage, _DistributedTransaction_serializeCheckpointData;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedTransactionType = exports.DistributedTransaction = exports.TransactionPayload = exports.TransactionCheckpoint = exports.TransactionStepError = exports.TransactionContext = void 0;
const utils_1 = require("@medusajs/utils");
const events_1 = require("events");
const promises_1 = require("node:timers/promises");
const base_in_memory_storage_1 = require("./datastore/base-in-memory-storage");
const errors_1 = require("./errors");
const transaction_orchestrator_1 = require("./transaction-orchestrator");
const types_1 = require("./types");
const flowMergeableProperties = [
    "state",
    "hasFailedSteps",
    "hasSkippedOnFailureSteps",
    "hasSkippedSteps",
    "hasRevertedSteps",
    "cancelledAt",
    "startedAt",
    "hasAsyncSteps",
    "_v",
    "timedOutAt",
];
const mergeStep = (currentStep, storedStep) => {
    const mergeProperties = [
        "attempts",
        "failures",
        "temporaryFailedAt",
        "retryRescheduledAt",
        "hasScheduledRetry",
        "lastAttempt",
        "_v",
        "stepFailed",
        "startedAt",
    ];
    for (const prop of mergeProperties) {
        if (prop === "hasScheduledRetry" || prop === "stepFailed") {
            currentStep[prop] = storedStep[prop] ?? currentStep[prop];
            continue;
        }
        currentStep[prop] =
            storedStep[prop] || currentStep[prop]
                ? Math.max(storedStep[prop] ?? 0, currentStep[prop] ?? 0)
                : currentStep[prop] ?? storedStep[prop];
    }
};
const getErrorSignature = (err) => `${err.action}:${err.handlerType}:${err.error?.message}`;
/**
 * @typedef TransactionContext
 * @property payload - Object containing the initial payload.
 * @property invoke - Object containing responses of Invoke handlers on steps flagged with saveResponse.
 * @property compensate - Object containing responses of Compensate handlers on steps flagged with saveResponse.
 */
class TransactionContext {
    constructor(payload = undefined, invoke = {}, compensate = {}) {
        this.payload = payload;
        this.invoke = invoke;
        this.compensate = compensate;
    }
}
exports.TransactionContext = TransactionContext;
class TransactionStepError {
    constructor(action, handlerType, error) {
        this.action = action;
        this.handlerType = handlerType;
        this.error = error;
    }
}
exports.TransactionStepError = TransactionStepError;
const stateFlowOrder = [
    types_1.TransactionState.NOT_STARTED,
    types_1.TransactionState.INVOKING,
    types_1.TransactionState.DONE,
    types_1.TransactionState.WAITING_TO_COMPENSATE,
    types_1.TransactionState.COMPENSATING,
    types_1.TransactionState.REVERTED,
    types_1.TransactionState.FAILED,
];
const stateFlowOrderMap = new Map(stateFlowOrder.map((state, index) => [state, index]));
const finishedStatesSet = new Set([
    types_1.TransactionState.DONE,
    types_1.TransactionState.REVERTED,
    types_1.TransactionState.FAILED,
]);
class TransactionCheckpoint {
    constructor(flow, context, errors = []) {
        this.flow = flow;
        this.context = context;
        this.errors = errors;
    }
    /**
     * Merge the current checkpoint with incoming data from a concurrent save operation.
     * This handles race conditions when multiple steps complete simultaneously.
     *
     * @param storedData - The checkpoint data being saved
     * @param savingStepId - Optional step ID if this is a step-specific save
     */
    static mergeCheckpoints(currentTransactionData, storedData) {
        if (!currentTransactionData || !storedData) {
            return currentTransactionData;
        }
        __classPrivateFieldGet(_a, _a, "m", _TransactionCheckpoint_mergeFlow).call(_a, currentTransactionData, storedData);
        __classPrivateFieldGet(_a, _a, "m", _TransactionCheckpoint_mergeErrors).call(_a, currentTransactionData.errors ?? [], storedData.errors);
        return currentTransactionData;
    }
}
exports.TransactionCheckpoint = TransactionCheckpoint;
_a = TransactionCheckpoint, _TransactionCheckpoint_mergeFlow = function _TransactionCheckpoint_mergeFlow(currentTransactionData, storedData) {
    const currentTransactionContext = currentTransactionData.context;
    const storedContext = storedData.context;
    if (currentTransactionData.flow._v >= storedData.flow._v) {
        for (const prop of flowMergeableProperties) {
            if (prop === "startedAt" ||
                prop === "cancelledAt" ||
                prop === "timedOutAt") {
                currentTransactionData.flow[prop] =
                    storedData.flow[prop] || currentTransactionData.flow[prop]
                        ? Math.max(storedData.flow[prop] ?? 0, currentTransactionData.flow[prop] ?? 0)
                        : currentTransactionData.flow[prop] ??
                            storedData.flow[prop] ??
                            undefined;
            }
            else if (prop === "_v") {
                currentTransactionData.flow[prop] = Math.max(storedData.flow[prop] ?? 0, currentTransactionData.flow[prop] ?? 0);
            }
            else if (prop === "state") {
                const currentStateIndex = stateFlowOrderMap.get(currentTransactionData.flow.state) ?? -1;
                const storedStateIndex = stateFlowOrderMap.get(storedData.flow.state) ?? -1;
                if (storedStateIndex > currentStateIndex) {
                    currentTransactionData.flow.state = storedData.flow.state;
                }
                else if (currentStateIndex < storedStateIndex &&
                    currentTransactionData.flow.state !==
                        types_1.TransactionState.WAITING_TO_COMPENSATE) {
                    throw new errors_1.SkipExecutionError(`Transaction is behind another execution`);
                }
            }
            else if (storedData.flow[prop] &&
                !currentTransactionData.flow[prop]) {
                currentTransactionData.flow[prop] = storedData.flow[prop];
            }
        }
    }
    const storedSteps = Object.values(storedData.flow.steps);
    for (const storedStep of storedSteps) {
        if (storedStep.id === "_root") {
            continue;
        }
        const stepName = storedStep.definition.action;
        const stepId = storedStep.id;
        // Merge context responses
        if (storedContext.invoke[stepName] &&
            !currentTransactionContext.invoke[stepName]) {
            currentTransactionContext.invoke[stepName] =
                storedContext.invoke[stepName];
        }
        if (storedContext.compensate[stepName] &&
            !currentTransactionContext.compensate[stepName]) {
            currentTransactionContext.compensate[stepName] =
                storedContext.compensate[stepName];
        }
        const currentStepVersion = currentTransactionData.flow.steps[stepId]._v;
        const storedStepVersion = storedData.flow.steps[stepId]._v;
        if (storedStepVersion > currentStepVersion) {
            throw new errors_1.SkipExecutionError(`Transaction is behind another execution`);
        }
        // Determine which state is further along in the process
        const shouldUpdateInvoke = __classPrivateFieldGet(_a, _a, "m", _TransactionCheckpoint_shouldUpdateStepState).call(_a, currentTransactionData.flow.steps[stepId].invoke, storedStep.invoke);
        const shouldUpdateCompensate = __classPrivateFieldGet(_a, _a, "m", _TransactionCheckpoint_shouldUpdateStepState).call(_a, currentTransactionData.flow.steps[stepId].compensate, storedStep.compensate);
        if (shouldUpdateInvoke) {
            currentTransactionData.flow.steps[stepId].invoke = storedStep.invoke;
        }
        if (shouldUpdateCompensate) {
            currentTransactionData.flow.steps[stepId].compensate =
                storedStep.compensate;
        }
        mergeStep(currentTransactionData.flow.steps[stepId], storedStep);
    }
}, _TransactionCheckpoint_shouldUpdateStepState = function _TransactionCheckpoint_shouldUpdateStepState(currentStepState, storedStepState) {
    if (currentStepState.state === storedStepState.state &&
        currentStepState.status === storedStepState.status) {
        return false;
    }
    // Check if state transition from stored to current is allowed
    const allowedStatesFromCurrent = __classPrivateFieldGet(_a, _a, "f", _TransactionCheckpoint_ALLOWED_STATE_TRANSITIONS)[currentStepState.state] || [];
    const isStateTransitionValid = allowedStatesFromCurrent.includes(storedStepState.state);
    if (currentStepState.state !== storedStepState.state) {
        return isStateTransitionValid;
    }
    // States are the same, check status transition
    // Special case: WAITING status can always be transitioned
    if (currentStepState.status === types_1.TransactionStepStatus.WAITING) {
        return true;
    }
    // Check if status transition from stored to current is allowed
    const allowedStatusesFromCurrent = __classPrivateFieldGet(_a, _a, "f", _TransactionCheckpoint_ALLOWED_STATUS_TRANSITIONS)[currentStepState.status] || [];
    return allowedStatusesFromCurrent.includes(storedStepState.status);
}, _TransactionCheckpoint_mergeErrors = function _TransactionCheckpoint_mergeErrors(currentErrors, incomingErrors) {
    const existingErrorSignatures = new Set(currentErrors.map(getErrorSignature));
    for (const error of incomingErrors) {
        if (!existingErrorSignatures.has(getErrorSignature(error))) {
            currentErrors.push(error);
            existingErrorSignatures.add(getErrorSignature(error));
        }
    }
};
_TransactionCheckpoint_ALLOWED_STATE_TRANSITIONS = { value: {
        [utils_1.TransactionStepState.DORMANT]: [utils_1.TransactionStepState.NOT_STARTED],
        [utils_1.TransactionStepState.NOT_STARTED]: [
            utils_1.TransactionStepState.INVOKING,
            utils_1.TransactionStepState.COMPENSATING,
            utils_1.TransactionStepState.FAILED,
            utils_1.TransactionStepState.SKIPPED,
            utils_1.TransactionStepState.SKIPPED_FAILURE,
        ],
        [utils_1.TransactionStepState.INVOKING]: [
            utils_1.TransactionStepState.FAILED,
            utils_1.TransactionStepState.DONE,
            utils_1.TransactionStepState.TIMEOUT,
            utils_1.TransactionStepState.SKIPPED,
        ],
        [utils_1.TransactionStepState.COMPENSATING]: [
            utils_1.TransactionStepState.REVERTED,
            utils_1.TransactionStepState.FAILED,
        ],
        [utils_1.TransactionStepState.DONE]: [utils_1.TransactionStepState.COMPENSATING],
    } };
_TransactionCheckpoint_ALLOWED_STATUS_TRANSITIONS = { value: {
        [types_1.TransactionStepStatus.WAITING]: [
            types_1.TransactionStepStatus.OK,
            types_1.TransactionStepStatus.TEMPORARY_FAILURE,
            types_1.TransactionStepStatus.PERMANENT_FAILURE,
        ],
        [types_1.TransactionStepStatus.TEMPORARY_FAILURE]: [
            types_1.TransactionStepStatus.IDLE,
            types_1.TransactionStepStatus.PERMANENT_FAILURE,
        ],
        [types_1.TransactionStepStatus.PERMANENT_FAILURE]: [types_1.TransactionStepStatus.IDLE],
    } };
class TransactionPayload {
    /**
     * @param metadata - The metadata of the transaction.
     * @param data - The initial payload data to begin a transation.
     * @param context - Object gathering responses of all steps flagged with saveResponse.
     */
    constructor(metadata, data, context) {
        this.metadata = metadata;
        this.data = data;
        this.context = context;
    }
}
exports.TransactionPayload = TransactionPayload;
/**
 * DistributedTransaction represents a distributed transaction, which is a transaction that is composed of multiple steps that are executed in a specific order.
 */
class DistributedTransaction extends events_1.EventEmitter {
    static setStorage(storage) {
        this.keyValueStore = storage;
    }
    constructor(flow, handler, payload, errors, context) {
        super();
        _DistributedTransaction_instances.add(this);
        this.flow = flow;
        this.handler = handler;
        this.payload = payload;
        this.errors = [];
        this.context = new TransactionContext();
        /**
         * Store data during the life cycle of the current transaction execution.
         * Store non persistent data such as transformers results, temporary data, etc.
         *
         * @private
         */
        _DistributedTransaction_temporaryStorage.set(this, new Map());
        this.transactionId = flow.transactionId;
        this.modelId = flow.modelId;
        this.runId = flow.runId;
        if (errors) {
            this.errors = errors;
        }
        this.context.payload = payload;
        if (context) {
            this.context = { ...context };
        }
    }
    getFlow() {
        return this.flow;
    }
    getContext() {
        return this.context;
    }
    getErrors(handlerType) {
        if (!(0, utils_1.isDefined)(handlerType)) {
            return this.errors;
        }
        return this.errors.filter((error) => error.handlerType === handlerType);
    }
    addError(action, handlerType, error) {
        this.errors.push({
            action,
            handlerType,
            error,
        });
    }
    addResponse(action, handlerType, response) {
        this.context[handlerType][action] = response;
    }
    hasFinished() {
        return finishedStatesSet.has(this.getState());
    }
    getState() {
        return this.getFlow().state;
    }
    get isPartiallyCompleted() {
        return !!this.getFlow().hasFailedSteps || !!this.getFlow().hasSkippedSteps;
    }
    canInvoke() {
        return (this.getFlow().state === types_1.TransactionState.NOT_STARTED ||
            this.getFlow().state === types_1.TransactionState.INVOKING);
    }
    canRevert() {
        return (this.getFlow().state === types_1.TransactionState.DONE ||
            this.getFlow().state === types_1.TransactionState.COMPENSATING);
    }
    hasTimeout() {
        return !!this.getTimeout();
    }
    getTimeout() {
        return this.getFlow().options?.timeout;
    }
    async saveCheckpoint({ ttl = 0, parallelSteps = 0, stepId, _v, } = {}) {
        const options = {
            ...(transaction_orchestrator_1.TransactionOrchestrator.getWorkflowOptions(this.modelId) ??
                this.getFlow().options),
        };
        if (!options?.store) {
            return;
        }
        options.stepId = stepId;
        if (_v) {
            options.parallelSteps = parallelSteps;
            options._v = _v;
        }
        const key = transaction_orchestrator_1.TransactionOrchestrator.getKeyName(DistributedTransaction.keyPrefix, this.modelId, this.transactionId);
        let checkpoint;
        let retries = 0;
        let backoffMs = 50;
        const maxRetries = (options?.parallelSteps || 1) + 2;
        while (retries < maxRetries) {
            checkpoint = __classPrivateFieldGet(this, _DistributedTransaction_instances, "m", _DistributedTransaction_serializeCheckpointData).call(this);
            try {
                const savedCheckpoint = await DistributedTransaction.keyValueStore.save(key, checkpoint, ttl, options);
                return savedCheckpoint;
            }
            catch (error) {
                if (transaction_orchestrator_1.TransactionOrchestrator.isExpectedError(error)) {
                    throw error;
                }
                else if (checkpoint.flow.state === types_1.TransactionState.NOT_STARTED) {
                    throw new errors_1.SkipExecutionError("Transaction already started for transactionId: " +
                        this.transactionId);
                }
                retries++;
                // Exponential backoff with jitter
                const jitter = Math.random() * backoffMs;
                await (0, promises_1.setTimeout)(backoffMs + jitter);
                backoffMs = Math.min(backoffMs * 2, 500);
                const lastCheckpoint = await DistributedTransaction.loadTransaction(this.modelId, this.transactionId);
                if (!lastCheckpoint) {
                    throw new errors_1.SkipExecutionError("Transaction already finished");
                }
                TransactionCheckpoint.mergeCheckpoints(checkpoint, lastCheckpoint);
                const [steps] = transaction_orchestrator_1.TransactionOrchestrator.buildSteps(checkpoint.flow.definition, checkpoint.flow.steps);
                checkpoint.flow.steps = steps;
                this.flow = checkpoint.flow;
                this.errors = checkpoint.errors;
                this.context = checkpoint.context;
                continue;
            }
        }
        throw new Error(`Max retries (${maxRetries}) exceeded for saving checkpoint due to version conflicts`);
    }
    static async loadTransaction(modelId, transactionId, options) {
        const key = transaction_orchestrator_1.TransactionOrchestrator.getKeyName(DistributedTransaction.keyPrefix, modelId, transactionId);
        const workflowOptions = transaction_orchestrator_1.TransactionOrchestrator.getWorkflowOptions(modelId);
        const loadedData = await DistributedTransaction.keyValueStore.get(key, {
            ...workflowOptions,
            isCancelling: options?.isCancelling,
        });
        if (loadedData) {
            return loadedData;
        }
        return null;
    }
    async scheduleRetry(step, interval) {
        if (this.hasFinished()) {
            return;
        }
        await DistributedTransaction.keyValueStore.scheduleRetry(this, step, Date.now(), interval);
    }
    async clearRetry(step) {
        await DistributedTransaction.keyValueStore.clearRetry(this, step);
    }
    async scheduleTransactionTimeout(interval) {
        // schedule transaction timeout only if there are async steps
        if (!this.getFlow().hasAsyncSteps) {
            return;
        }
        await DistributedTransaction.keyValueStore.scheduleTransactionTimeout(this, Date.now(), interval);
    }
    async clearTransactionTimeout() {
        if (!this.getFlow().hasAsyncSteps) {
            return;
        }
        await DistributedTransaction.keyValueStore.clearTransactionTimeout(this);
    }
    async scheduleStepTimeout(step, interval) {
        // schedule step timeout only if the step is async
        if (!step.definition.async) {
            return;
        }
        await this.saveCheckpoint();
        await DistributedTransaction.keyValueStore.scheduleStepTimeout(this, step, Date.now(), interval);
    }
    async clearStepTimeout(step) {
        if (!step.definition.async || step.isCompensating()) {
            return;
        }
        await DistributedTransaction.keyValueStore.clearStepTimeout(this, step);
    }
    setTemporaryData(key, value) {
        __classPrivateFieldGet(this, _DistributedTransaction_temporaryStorage, "f").set(key, value);
    }
    getTemporaryData(key) {
        return __classPrivateFieldGet(this, _DistributedTransaction_temporaryStorage, "f").get(key);
    }
    hasTemporaryData(key) {
        return __classPrivateFieldGet(this, _DistributedTransaction_temporaryStorage, "f").has(key);
    }
}
exports.DistributedTransactionType = DistributedTransaction;
_DistributedTransaction_temporaryStorage = new WeakMap(), _DistributedTransaction_instances = new WeakSet(), _DistributedTransaction_serializeCheckpointData = function _DistributedTransaction_serializeCheckpointData() {
    try {
        JSON.stringify(this.context);
    }
    catch {
        throw new errors_1.NonSerializableCheckPointError("Unable to serialize context object. Please make sure the workflow input and steps response are serializable.");
    }
    let errorsToUse = this.getErrors();
    try {
        JSON.stringify(errorsToUse);
    }
    catch {
        // Sanitize non-serializable errors
        const sanitizedErrors = [];
        for (const error of this.errors) {
            try {
                JSON.stringify(error);
                sanitizedErrors.push(error);
            }
            catch {
                sanitizedErrors.push({
                    action: error.action,
                    handlerType: error.handlerType,
                    error: {
                        name: error.error?.name || "Error",
                        message: error.error?.message || String(error.error),
                        stack: error.error?.stack,
                    },
                });
            }
        }
        errorsToUse = sanitizedErrors;
        this.errors = sanitizedErrors;
    }
    return new TransactionCheckpoint(JSON.parse(JSON.stringify(this.getFlow())), this.getContext(), [...errorsToUse]);
};
DistributedTransaction.keyPrefix = "dtrx";
DistributedTransaction.setStorage(new base_in_memory_storage_1.BaseInMemoryDistributedTransactionStorage());
global.DistributedTransaction ??= DistributedTransaction;
const GlobalDistributedTransaction = global.DistributedTransaction;
exports.DistributedTransaction = GlobalDistributedTransaction;
//# sourceMappingURL=distributed-transaction.js.map