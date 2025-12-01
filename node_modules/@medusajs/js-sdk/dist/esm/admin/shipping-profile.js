var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class ShippingProfile {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method creates a new shipping profile. It sends a request to the
     * [Create Shipping Profile](https://docs.medusajs.com/api/admin#shipping-profiles_postshippingprofiles)
     * API route.
     *
     * @param body - The details of the shipping profile to create.
     * @param query - Configure the fields and relations to retrieve in the shipping profile.
     * @param headers - Headers to pass in the request.
     * @returns The shipping profile's details.
     *
     * @example
     * sdk.admin.shippingProfile.create({
     *   name: "Default Shipping Profile",
     * })
     * .then(({ shipping_profile }) => {
     *   console.log(shipping_profile)
     * })
     */
    create(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/shipping-profiles`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method updates a shipping profile. It sends a request to the
     * [Update Shipping Profile](https://docs.medusajs.com/api/admin#shipping-profiles_postshippingprofilesid)
     * API route.
     *
     * @param id - The ID of the shipping profile to update.
     * @param body - The details of the shipping profile to update.
     * @param query - Configure the fields and relations to retrieve in the shipping profile.
     * @param headers - Headers to pass in the request.
     * @returns The shipping profile's details.
     *
     * @example
     * sdk.admin.shippingProfile.update("sp_123", {
     *   name: "Updated Shipping Profile",
     * })
     * .then(({ shipping_profile }) => {
     *   console.log(shipping_profile)
     * })
     */
    update(id, body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/shipping-profiles/${id}`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
    /**
     * This method deletes a shipping profile. It sends a request to the
     * [Delete Shipping Profile](https://docs.medusajs.com/api/admin#shipping-profiles_deleteshippingprofilesid)
     * API route.
     *
     * @param id - The ID of the shipping profile to delete.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.shippingProfile.delete("sp_123")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/shipping-profiles/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * This method retrieves a list of shipping profiles. It sends a request to the
     * [List Shipping Profiles](https://docs.medusajs.com/api/admin#shipping-profiles_getshippingprofiles)
     * API route.
     *
     * @param query - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The list of shipping profiles.
     *
     * @example
     * To retrieve the list of shipping profiles:
     *
     * ```ts
     * sdk.admin.shippingProfile.list()
     * .then(({ shipping_profiles, count, limit, offset }) => {
     *   console.log(shipping_profiles)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.shippingProfile.list({
     *   limit: 10,
     *   offset: 10
     * })
     * .then(({ shipping_profiles, count, limit, offset }) => {
     *   console.log(shipping_profiles)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each shipping profile:
     *
     * ```ts
     * sdk.admin.shippingProfile.list({
     *   fields: "id,name"
     * })
     * .then(({ shipping_profiles, count, limit, offset }) => {
     *   console.log(shipping_profiles)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    list(query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/shipping-profiles`, {
                method: "GET",
                headers,
                query,
            });
        });
    }
    /**
     * This method retrieves a shipping profile. It sends a request to the
     * [Get Shipping Profile](https://docs.medusajs.com/api/admin#shipping-profiles_getshippingprofilesid)
     * API route.
     *
     * @param id - The ID of the shipping profile to retrieve.
     * @param query - Configure the fields and relations to retrieve in the shipping profile.
     * @param headers - Headers to pass in the request.
     * @returns The shipping profile's details.
     *
     * @example
     * To retrieve a shipping profile by its ID:
     *
     * ```ts
     * sdk.admin.shippingProfile.retrieve("sp_123")
     * .then(({ shipping_profile }) => {
     *   console.log(shipping_profile)
     * })
     * ```
     *
     * To specify the fields and relations to retrieve:
     *
     * ```ts
     * sdk.admin.shippingProfile.retrieve("sp_123", {
     *   fields: "id,name"
     * })
     * .then(({ shipping_profile }) => {
     *   console.log(shipping_profile)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/admin#select-fields-and-relations).
     */
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/shipping-profiles/${id}`, {
                method: "GET",
                headers,
                query,
            });
        });
    }
}
//# sourceMappingURL=shipping-profile.js.map