"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStepHandler = createStepHandler;
const utils_1 = require("@medusajs/utils");
const resolve_value_1 = require("./resolve-value");
function buildStepContext({ action, stepArguments, }) {
    const metadata = stepArguments.metadata;
    const idempotencyKey = metadata.idempotency_key;
    stepArguments.context.idempotencyKey = idempotencyKey;
    const flow = stepArguments.transaction.getFlow();
    const flowMetadata = flow?.metadata;
    const stepDefinition = stepArguments.step.definition;
    const executionContext = {
        workflowId: metadata.model_id,
        stepName: metadata.action,
        action,
        idempotencyKey,
        attempt: metadata.attempt,
        container: stepArguments.container,
        metadata,
        eventGroupId: flowMetadata?.eventGroupId ?? stepArguments.context.eventGroupId,
        parentStepIdempotencyKey: flowMetadata?.parentStepIdempotencyKey,
        preventReleaseEvents: flowMetadata?.preventReleaseEvents ?? false,
        transactionId: stepArguments.context.transactionId,
        runId: flow.runId,
        context: stepArguments.context,
        " stepDefinition": stepDefinition,
        " getStepResult"(stepId, action = "invoke") {
            return stepArguments[action][stepId]?.output?.output;
        },
    };
    return executionContext;
}
function createStepHandler({ stepName, input, invokeFn, compensateFn, }) {
    const handler = {
        invoke: async (stepArguments) => {
            const executionContext = buildStepContext({
                action: "invoke",
                stepArguments,
            });
            let argInput = {};
            if (input) {
                argInput = (0, resolve_value_1.resolveValue)(input, stepArguments);
                if (argInput instanceof Promise) {
                    argInput = await argInput;
                }
            }
            const stepResponse = await invokeFn.apply(this, [
                argInput,
                executionContext,
            ]);
            if (!stepResponse || typeof stepResponse !== "object") {
                return {
                    __type: utils_1.OrchestrationUtils.SymbolWorkflowWorkflowData,
                    output: stepResponse,
                };
            }
            const stepResponseJSON = stepResponse.__type === utils_1.OrchestrationUtils.SymbolWorkflowStepResponse
                ? stepResponse.toJSON()
                : stepResponse;
            return {
                __type: utils_1.OrchestrationUtils.SymbolWorkflowWorkflowData,
                output: stepResponseJSON,
            };
        },
        compensate: compensateFn
            ? async (stepArguments) => {
                const executionContext = buildStepContext({
                    action: "compensate",
                    stepArguments,
                });
                const stepOutput = stepArguments.invoke[stepName]?.output;
                if (!stepOutput) {
                    const output = await compensateFn.apply(this, [
                        stepOutput,
                        executionContext,
                    ]);
                    return { output };
                }
                const invokeResult = stepOutput.__type === utils_1.OrchestrationUtils.SymbolWorkflowStepResponse
                    ? stepOutput.compensateInput
                    : stepOutput;
                const output = await compensateFn.apply(this, [
                    invokeResult,
                    executionContext,
                ]);
                return {
                    output,
                };
            }
            : undefined,
    };
    return handler;
}
//# sourceMappingURL=create-step-handler.js.map