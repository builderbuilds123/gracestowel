var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class User {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method updates a user. It sends a request to the
     * [Update User](https://docs.medusajs.com/api/admin#users_postusersid)
     * API route.
     *
     * @param id - The ID of the user to update.
     * @param body - The details of the user to update.
     * @param query - Configure the fields and relations to retrieve in the tax region.
     * @param headers - Headers to pass in the request.
     * @returns The user's details.
     *
     * @example
     * sdk.admin.user.update("user_123", {
     *   first_name: "John",
     *   last_name: "Doe",
     * })
     * .then(({ user }) => {
     *   console.log(user)
     * })
     */
    update(id, body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/users/${id}`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method retrieves a list of users. It sends a request to the
     * [List Users](https://docs.medusajs.com/api/admin#users_getusers)
     * API route.
     *
     * @param queryParams - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The list of users.
     *
     * @example
     * To retrieve the list of users:
     *
     * ```ts
     * sdk.admin.user.list()
     * .then(({ users, count, limit, offset }) => {
     *   console.log(users)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.user.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ users, count, limit, offset }) => {
     *   console.log(users)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each user:
     *
     * ```ts
     * sdk.admin.user.list({
     *   fields: "id,email"
     * })
     * .then(({ users, count, limit, offset }) => {
     *   console.log(users)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    list(queryParams, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/users`, {
                headers,
                query: queryParams,
            });
        });
    }
    /**
     * This method retrieves a user. It sends a request to the
     * [Get User](https://docs.medusajs.com/api/admin#users_getusersid)
     * API route.
     *
     * @param id - The ID of the user to retrieve.
     * @param query - Configure the fields and relations to retrieve in the user.
     * @param headers - Headers to pass in the request.
     * @returns The user's details.
     *
     * @example
     * To retrieve a user by its ID:
     *
     * ```ts
     * sdk.admin.user.retrieve("user_123")
     * .then(({ user }) => {
     *   console.log(user)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.user.retrieve("user_123", {
     *   fields: "id,email"
     * })
     * .then(({ user }) => {
     *   console.log(user)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/users/${id}`, {
                query,
                headers,
            });
        });
    }
    /**
     * This method deletes a user. It sends a request to the
     * [Delete User](https://docs.medusajs.com/api/admin#users_deleteusersid)
     * API route.
     *
     * @param id - The ID of the user to delete.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.user.delete("user_123")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/users/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method retrieves the currently authenticated user. It sends a request to the
     * [Get Logged-In User](https://docs.medusajs.com/api/admin#users_getusersme)
     * API route.
     *
     * @param query - Configure the fields and relations to retrieve in the user.
     * @param headers - Headers to pass in the request.
     * @returns The user's details.
     *
     * @example
     * To retrieve the currently authenticated user:
     *
     * ```ts
     * sdk.admin.user.me()
     * .then(({ user }) => {
     *   console.log(user)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.user.me({
     *   fields: "id,email"
     * })
     * .then(({ user }) => {
     *   console.log(user)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    me(query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/users/me`, {
                query,
                headers,
            });
        });
    }
}
//# sourceMappingURL=user.js.map