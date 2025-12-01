var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class ReturnReason {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method retrieves a list of return reasons. It sends a request to the
     * [List Return Reasons](https://docs.medusajs.com/api/admin#return-reasons_returnreason_schema)
     * API route.
     *
     * @param query - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The paginated list of return reasons.
     *
     * @example
     * To retrieve the list of return reasons:
     *
     * ```ts
     * sdk.admin.returnReason.list()
     * .then(({ return_reasons, count, limit, offset }) => {
     *   console.log(return_reasons)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.returnReason.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ return_reasons, count, limit, offset }) => {
     *   console.log(return_reasons)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each return reason:
     *
     * ```ts
     * sdk.admin.returnReason.list({
     *   fields: "id,value"
     * })
     * .then(({ return_reasons, count, limit, offset }) => {
     *   console.log(return_reasons)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    list(query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch("/admin/return-reasons", {
                headers,
                query,
            });
        });
    }
    /**
     * This method retrieves a return reason by ID. It sends a request to the
     * [Get Return Reason](https://docs.medusajs.com/api/admin#return-reasons_getreturnreasonsid)
     * API route.
     *
     * @param id - The return reason's ID.
     * @param query - Configure the fields and relations to retrieve in the return reason.
     * @param headers - Headers to pass in the request.
     * @returns The return reason's details.
     *
     * @example
     * To retrieve a return reason by its ID:
     *
     * ```ts
     * sdk.admin.returnReason.retrieve("ret_123")
     * .then(({ return_reason }) => {
     *   console.log(return_reason)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.returnReason.retrieve("ret_123", {
     *   fields: "id,value"
     * })
     * .then(({ return_reason }) => {
     *   console.log(return_reason)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/return-reasons/${id}`, {
                query,
                headers,
            });
        });
    }
    /**
     * This method creates a return reason. It sends a request to the
     * [Create Return Reason](https://docs.medusajs.com/api/admin#return-reasons_postreturnreasons)
     * API route.
     *
     * @param body - The details of the return reason to create.
     * @param query - Configure the fields and relations to retrieve in the return reason.
     * @param headers - Headers to pass in the request.
     * @returns The return reason's details.
     *
     * @example
     * sdk.admin.returnReason.create({
     *   value: "refund",
     *   label: "Refund",
     * })
     * .then(({ return_reason }) => {
     *   console.log(return_reason)
     * })
     */
    create(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/return-reasons`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method updates a return reason. It sends a request to the
     * [Update Return Reason](https://docs.medusajs.com/api/admin#return-reasons_postreturnreasonsid)
     * API route.
     *
     * @param id - The return reason's ID.
     * @param body - The details of the return reason to update.
     * @param query - Configure the fields and relations to retrieve in the return reason.
     * @param headers - Headers to pass in the request.
     * @returns The return reason's details.
     *
     * @example
     * sdk.admin.returnReason.update("ret_123", {
     *   value: "refund",
     *   label: "Refund",
     * })
     * .then(({ return_reason }) => {
     *   console.log(return_reason)
     * })
     */
    update(id, body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/return-reasons/${id}`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method deletes a return reason. It sends a request to the
     * [Delete Return Reason](https://docs.medusajs.com/api/admin#return-reasons_deletereturnreasonsid)
     * API route.
     *
     * @param id - The return reason's ID.
     * @param query - Query parameters to pass to the request.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.returnReason.delete("ret_123")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/return-reasons/${id}`, {
                method: "DELETE",
                headers,
                query,
            });
        });
    }
}
//# sourceMappingURL=return-reason.js.map