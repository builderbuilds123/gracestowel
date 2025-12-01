import { HttpTypes } from "@medusajs/types";
import { Client } from "../client";
import { ClientHeaders } from "../types";
export declare class WorkflowExecution {
    /**
     * @ignore
     */
    private client;
    /**
     * @ignore
     */
    constructor(client: Client);
    /**
     * This method retrieves a list of workflow executions. It sends a request to the
     * [List Workflow Executions](https://docs.medusajs.com/api/admin#workflows-executions_getworkflowsexecutions)
     * API route.
     *
     * @param queryParams - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The list of workflow executions.
     *
     * @example
     * To retrieve the list of workflow executions:
     *
     * ```ts
     * sdk.admin.workflowExecution.list()
     * .then(({ workflow_executions, count, limit, offset }) => {
     *   console.log(workflow_executions)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.workflowExecution.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ workflow_executions, count, limit, offset }) => {
     *   console.log(workflow_executions)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each workflow execution:
     *
     * ```ts
     * sdk.admin.workflowExecution.list({
     *   fields: "id,name"
     * })
     * .then(({ workflow_executions, count, limit, offset }) => {
     *   console.log(workflow_executions)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    list(queryParams?: HttpTypes.AdminGetWorkflowExecutionsParams, headers?: ClientHeaders): Promise<HttpTypes.AdminWorkflowExecutionListResponse>;
    /**
     * This method retrieves a workflow execution by its ID. It sends a request to the
     * [Get Workflow Execution](https://docs.medusajs.com/api/admin#workflows-executions_getworkflowsexecutionsworkflow_idtransaction_id)
     * API route.
     *
     * @param id - The ID of the workflow execution to retrieve.
     * @param headers - Headers to pass in the request.
     * @returns The workflow execution's details.
     *
     * @example
     * sdk.admin.workflowExecution.retrieve("wrk_123")
     * .then(({ workflow_execution }) => {
     *   console.log(workflow_execution)
     * })
     */
    retrieve(id: string, headers?: ClientHeaders): Promise<HttpTypes.AdminWorkflowExecutionResponse>;
}
//# sourceMappingURL=workflow-execution.d.ts.map