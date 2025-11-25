var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class Customer {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method creates a customer. It sends a request to the
     * [Create Customer](https://docs.medusajs.com/api/admin#customers_postcustomers) API route.
     *
     * @param body - The customer's details.
     * @param query - Configure the fields to retrieve in the customer.
     * @param headers - Headers to pass in the request.
     * @returns The customer's details.
     *
     * @example
     * sdk.admin.customer.create({
     *   email: "customer@gmail.com"
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    create(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/customers`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method updates a customer's details. It sends a request to the
     * [Update Customer](https://docs.medusajs.com/api/admin#customers_postcustomersid) API route.
     *
     * @param id - The customer's ID.
     * @param body - The details to update of the customer.
     * @param query - Configure the fields to retrieve in the customer.
     * @param headers - Headers to pass in the request.
     * @returns The customer's details.
     *
     * @example
     * sdk.admin.customer.update("cus_123", {
     *   first_name: "John"
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    update(id, body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/customers/${id}`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method retrieves a paginated list of customers. It sends a request to the
     * [List Customers](https://docs.medusajs.com/api/admin#customers_getcustomers)
     * API route.
     *
     * @param queryParams - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The paginated list of customers.
     *
     * @example
     * To retrieve the list of customers:
     *
     * ```ts
     * sdk.admin.customer.list()
     * .then(({ customers, count, limit, offset }) => {
     *   console.log(customers)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.customer.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ customers, count, limit, offset }) => {
     *   console.log(customers)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each customer:
     *
     * ```ts
     * sdk.admin.customer.list({
     *   fields: "id,*groups"
     * })
     * .then(({ customers, count, limit, offset }) => {
     *   console.log(customers)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/store#select-fields-and-relations).
     */
    list(queryParams, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/customers`, {
                headers,
                query: queryParams,
            });
        });
    }
    /**
     * This method retrieves a customer by its ID. It sends a request to the
     * [Get Customer](https://docs.medusajs.com/api/admin#customers_getcustomersid)
     * API route.
     *
     * @param id - The customer's ID.
     * @param query - Configure the fields to retrieve in the customer.
     * @param headers - Headers to pass in the request.
     * @returns The customer's details.
     *
     * @example
     * To retrieve a customer by its ID:
     *
     * ```ts
     * sdk.admin.customer.retrieve("cus_123")
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.customer.retrieve("cus_123", {
     *   fields: "id,*groups"
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/store#select-fields-and-relations).
     */
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/customers/${id}`, {
                query,
                headers,
            });
        });
    }
    /**
     * This method deletes a customer by its ID. It sends a request to the
     * [Delete Customer](https://docs.medusajs.com/api/admin#customers_deletecustomersid)
     * API route.
     *
     * @param id - The customer's ID.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.customer.delete("cus_123")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/customers/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method manages customer groups for a customer.
     * It sends a request to the [Manage Customers](https://docs.medusajs.com/api/admin#customers_postcustomersidcustomergroups)
     * API route.
     *
     * @param id - The customer's ID.
     * @param body - The groups to add customer to or remove customer from.
     * @param headers - Headers to pass in the request
     * @returns The customers details.
     *
     * @example
     * sdk.admin.customer.batchCustomerGroups("cus_123", {
     *   add: ["cusgroup_123"],
     *   remove: ["cusgroup_321"]
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    batchCustomerGroups(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/customer-groups`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
    /**
     * This method creates a customer address. It sends a request to the
     * [Create Customer Address](https://docs.medusajs.com/api/admin#customers_postcustomersidaddresses)
     * API route.
     *
     * @param id - The customer's ID.
     * @param body - The customer address's details.
     * @param headers - Headers to pass in the request.
     * @returns The customer address's details.
     *
     * @example
     * sdk.admin.customer.createAddress("cus_123", {
     *   address_1: "123 Main St",
     *   city: "Anytown",
     *   country_code: "US",
     *   postal_code: "12345"
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    createAddress(id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/addresses`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
    /**
     * This method updates a customer address. It sends a request to the
     * [Update Customer Address](https://docs.medusajs.com/api/admin#customers_postcustomersidaddressesaddressid)
     * API route.
     *
     * @param id - The customer's ID.
     * @param addressId - The customer address's ID.
     * @param body - The customer address's details.
     * @param headers - Headers to pass in the request.
     * @returns The customer address's details.
     *
     * @example
     * sdk.admin.customer.updateAddress("cus_123", "cus_addr_123", {
     *   address_1: "123 Main St",
     *   city: "Anytown",
     *   country_code: "US",
     *   postal_code: "12345"
     * })
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    updateAddress(id, addressId, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/addresses/${addressId}`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
    /**
     * This method deletes a customer address. It sends a request to the
     * [Delete Customer Address](https://docs.medusajs.com/api/admin#customers_deletecustomersidaddressesaddressid)
     * API route.
     *
     * @param id - The customer's ID.
     * @param addressId - The customer address's ID.
     * @param headers - Headers to pass in the request.
     * @returns The customer address's details.
     *
     * @example
     * sdk.admin.customer.deleteAddress("cus_123", "cus_addr_123")
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    deleteAddress(id, addressId, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/addresses/${addressId}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method retrieves a customer address by its ID. It sends a request to the
     * [Get Customer Address](https://docs.medusajs.com/api/admin#customers_getcustomersidaddressesaddressid)
     * API route.
     *
     * @param id - The customer's ID.
     * @param addressId - The customer address's ID.
     * @param headers - Headers to pass in the request.
     * @returns The customer address's details.
     *
     * @example
     * sdk.admin.customer.retrieveAddress("cus_123", "cus_addr_123")
     * .then(({ customer }) => {
     *   console.log(customer)
     * })
     */
    retrieveAddress(id, addressId, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/addresses/${addressId}`, {
                headers,
            });
        });
    }
    /**
     * This method retrieves a list of customer addresses. It sends a request to the
     * [List Customer Addresses](https://docs.medusajs.com/api/admin#customers_getcustomersidaddresses)
     * API route.
     *
     * @param id - The customer's ID.
     * @param headers - Headers to pass in the request.
     * @returns The list of customer addresses.
     *
     * @example
     * sdk.admin.customer.listAddresses("cus_123")
     * .then(({ addresses }) => {
     *   console.log(addresses)
     * })
     */
    listAddresses(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/customers/${id}/addresses`, {
                headers,
            });
        });
    }
}
//# sourceMappingURL=customer.js.map