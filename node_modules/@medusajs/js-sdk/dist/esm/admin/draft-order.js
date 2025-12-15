var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class DraftOrder {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method retrieves a draft order by its ID. It sends a request to the
     * [Get Draft Order](https://docs.medusajs.com/api/admin#draft-orders_getdraftordersid)
     * API route.
     *
     * @param id - The draft order's ID.
     * @param query - Configure the fields to retrieve in the draft order.
     * @param headers - Headers to pass in the request
     * @returns The draft order's details.
     *
     * @example
     * To retrieve a draft order by its ID:
     *
     * ```ts
     * sdk.admin.draftOrder.retrieve("order_123")
     * .then(({ draft_order }) => {
     *   console.log(draft_order)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.draftOrder.retrieve("order_123", {
     *   fields: "id,*items"
     * })
     * .then(({ draft_order }) => {
     *   console.log(draft_order)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/store#select-fields-and-relations).
     */
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}`, {
                query,
                headers,
            });
        });
    }
    /**
     * This method retrieves a paginated list of draft orders. It sends a request to the
     * [List Draft Orders](https://docs.medusajs.com/api/admin#draft-orders_getdraftorders) API route.
     *
     * @param queryParams - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The paginated list of draft orders.
     *
     * @example
     * To retrieve the list of draft orders:
     *
     * ```ts
     * sdk.admin.draftOrder.list()
     * .then(({ draft_orders, count, limit, offset }) => {
     *   console.log(draft_orders)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.draftOrder.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ draft_orders, count, limit, offset }) => {
     *   console.log(draft_orders)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each draft order:
     *
     * ```ts
     * sdk.admin.draftOrder.list({
     *   fields: "id,*items"
     * })
     * .then(({ draft_orders, count, limit, offset }) => {
     *   console.log(draft_orders)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/store#select-fields-and-relations).
     */
    list(queryParams, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders`, {
                query: queryParams,
                headers,
            });
        });
    }
    /**
     * This method creates a draft order. It sends a request to the
     * [Create Draft Order](https://docs.medusajs.com/api/admin#draft-orders_postdraftorders) API route.
     *
     * @param body - The data to create the draft order.
     * @param query - Configure the fields to retrieve in the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order's details.
     *
     * @example
     * sdk.admin.draftOrder.create({
     *   email: "test@test.com",
     *   items: [
     *     {
     *       variant_id: "variant_123",
     *       quantity: 1,
     *     },
     *   ],
     *   region_id: "region_123",
     *   sales_channel_id: "sc_123",
     * })
     * .then(({ draft_order }) => {
     *   console.log(draft_order)
     * })
     */
    create(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders`, {
                method: "POST",
                body,
                query,
                headers,
            });
        });
    }
    /**
     * This method deletes a draft order. It sends a request to the
     * [Delete Draft Order](https://docs.medusajs.com/api/admin#draft-orders_deleteordereditsid) API route.
     *
     * @param id - The draft order's ID.
     * @param headers - Headers to pass in the request.
     *
     * @example
     * sdk.admin.draftOrder.delete("order_123")
     * .then(({ id, object, deleted }) => {
     *   console.log(id, object, deleted)
     * })
     */
    delete(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method updates a draft order. It sends a request to the
     * [Update Draft Order](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersid) API route.
     *
     * @param id - The draft order's ID.
     * @param body - The data to update the draft order.
     * @param query - Configure the fields to retrieve in the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order's details.
     *
     * @example
     * sdk.admin.draftOrder.update("order_123", {
     *   email: "test@test.com",
     * })
     * .then(({ draft_order }) => {
     *   console.log(draft_order)
     * })
     */
    update(id, body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}`, {
                method: "POST",
                body,
                query,
                headers,
            });
        });
    }
    /**
     * This method converts a draft order to an order. It sends a request to the
     * [Convert Draft Order to Order](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersidconverttoorder) API route.
     *
     * @param id - The draft order's ID.
     * @param query - Configure the fields to retrieve in the order.
     * @param headers - Headers to pass in the request.
     * @returns The order's details.
     *
     * @example
     * sdk.admin.draftOrder.convertToOrder("order_123")
     * .then(({ order }) => {
     *   console.log(order)
     * })
     */
    convertToOrder(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/convert-to-order`, {
                method: "POST",
                query,
                headers,
            });
        });
    }
    /**
     * This method adds items to a draft order. It sends a request to the
     * [Add Draft Order Items](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersidedititems) API route.
     *
     * @param id - The draft order's ID.
     * @param body - The data to add the items to the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.addItems("order_123", {
     *   items: [
     *     {
     *       variant_id: "variant_123",
     *       quantity: 1,
     *     },
     *   ],
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    addItems(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/items`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method updates an item that is part of an action in a draft order. It sends a request to the
     * [Update Draft Order Item](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersidedititemsaction_id) API route.
     *
     * @param id - The draft order's ID.
     * @param actionId - The action ID.
     * @param body - The data to update the item.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.updateActionItem("order_123", "action_123", {
     *   quantity: 2,
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    updateActionItem(id, actionId, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/items/${actionId}`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method removes an item that is part of an action in a draft order. It sends a request to the
     * [Remove Draft Order Item](https://docs.medusajs.com/api/admin#draft-orders_deletedraftordersidedititemsaction_id) API route.
     *
     * @param id - The draft order's ID.
     * @param actionId - The action ID.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.removeActionItem("order_123", "action_123")
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    removeActionItem(id, actionId, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/items/${actionId}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method updates an item in a draft order. It sends a request to the
     * [Update Draft Order Item](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersidedititemsitemitem_id) API route.
     *
     * @param id - The draft order's ID.
     * @param itemId - The item ID.
     * @param body - The data to update the item.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.updateItem("order_123", "item_123", {
     *   quantity: 2,
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    updateItem(id, itemId, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/items/item/${itemId}`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method adds promotions to a draft order. It sends a request to the
     * [Add Draft Order Promotions](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditpromotions) API route.
     *
     * @param id - The draft order's ID.
     * @param body - The data to add the promotions to the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.addPromotions("order_123", {
     *   promo_codes: ["PROMO_CODE_1", "PROMO_CODE_2"],
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    addPromotions(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/promotions`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method removes promotions from a draft order. It sends a request to the
     * [Remove Draft Order Promotions](https://docs.medusajs.com/api/admin#draft-orders_deletedraftordersideditpromotions) API route.
     *
     * @param id - The draft order's ID.
     * @param body - The data to remove the promotions from the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.removePromotions("order_123", {
     *   promo_codes: ["PROMO_CODE_1", "PROMO_CODE_2"],
     * })
     */
    removePromotions(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/promotions`, {
                method: "DELETE",
                body,
                headers,
            });
        });
    }
    /**
     * This method adds a shipping method to a draft order. It sends a request to the
     * [Add Draft Order Shipping Method](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditshippingmethods) API route.
     *
     * @param id - The draft order's ID.
     * @param body - The data to add the shipping method to the draft order.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.addShippingMethod("order_123", {
     *   shipping_option_id: "shipping_option_123",
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    addShippingMethod(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/shipping-methods`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method updates a shipping method in a draft order. It sends a request to the
     * [Update Draft Order Shipping Method](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditshippingmethodsaction_id) API route.
     *
     * @param id - The draft order's ID.
     * @param actionId - The action ID.
     * @param body - The data to update the shipping method.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.updateShippingMethod("order_123", "action_123", {
     *   shipping_option_id: "shipping_option_123",
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    updateActionShippingMethod(id, actionId, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/shipping-methods/${actionId}`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method removes a shipping method from a draft order. It sends a request to the
     * [Remove Draft Order Shipping Method](https://docs.medusajs.com/api/admin#draft-orders_deletedraftordersideditshippingmethodsaction_id) API route.
     *
     * @param id - The draft order's ID.
     * @param actionId - The action ID.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.removeShippingMethod("order_123", "action_123")
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    removeActionShippingMethod(id, actionId, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/shipping-methods/${actionId}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method removes a shipping method from an edited draft order. It sends a request to the
     * [Remove Draft Order Shipping Method](https://docs.medusajs.com/api/admin#draft-orders_deletedraftordersideditshippingmethodsmethodmethod_id) API route.
     *
     * @param id - The draft order's ID.
     * @param shippingMethodId - The shipping method's ID.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.removeShippingMethod(
     *   "order_123",
     *   "shipping_method_123"
     * )
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    removeShippingMethod(id, shippingMethodId, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/shipping-methods/method/${shippingMethodId}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method updates a shipping method in a draft order. It sends a request to the
     * [Update Draft Order Shipping Method](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditshippingmethodsmethodmethod_id) API route.
     *
     * @param id - The draft order's ID.
     * @param methodId - The shipping method's ID.
     * @param body - The data to update the shipping method.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.updateShippingMethod("order_123", "sm_123", {
     *  shipping_option_id: "so_123",
     * })
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    updateShippingMethod(id, methodId, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/shipping-methods/method/${methodId}`, {
                method: "POST",
                body,
                headers,
            });
        });
    }
    /**
     * This method begins an edit to a draft order. It sends a request to the
     * [Begin Draft Order Edit](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersidedit) API route.
     *
     * @param id - The draft order's ID.
     * @param headers - Headers to pass in the request.
     *
     * @example
     * sdk.admin.draftOrder.beginEdit("order_123")
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    beginEdit(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit`, {
                method: "POST",
                headers,
            });
        });
    }
    /**
     * This method cancels an edit to a draft order. It sends a request to the
     * [Cancel Draft Order Edit](https://docs.medusajs.com/api/admin#draft-orders_deletedraftordersidedit) API route.
     *
     * @param id - The draft order's ID.
     * @param headers - Headers to pass in the request.
     * @returns The cancelation's details.
     *
     * @example
     * sdk.admin.draftOrder.cancelEdit("order_123")
     * .then(({ id, object, deleted }) => {
     *   console.log(id, object, deleted)
     * })
     */
    cancelEdit(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method requests an edit to a draft order. It sends a request to the
     * [Request Draft Order Edit](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditrequest) API route.
     *
     * @param id - The draft order's ID.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.requestEdit("order_123")
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    requestEdit(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/request`, {
                method: "POST",
                headers,
            });
        });
    }
    /**
     * This method confirms an edit to a draft order. It sends a request to the
     * [Confirm Draft Order Edit](https://docs.medusajs.com/api/admin#draft-orders_postdraftordersideditconfirm) API route.
     *
     * @param id - The draft order's ID.
     * @param headers - Headers to pass in the request.
     * @returns The draft order preview's details.
     *
     * @example
     * sdk.admin.draftOrder.confirmEdit("order_123")
     * .then(({ draft_order_preview }) => {
     *   console.log(draft_order_preview)
     * })
     */
    confirmEdit(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/draft-orders/${id}/edit/confirm`, {
                method: "POST",
                headers,
            });
        });
    }
}
//# sourceMappingURL=draft-order.js.map