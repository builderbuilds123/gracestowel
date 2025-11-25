var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const taxProviderUrl = "/admin/tax-providers";
export class TaxProvider {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method retrieves a list of tax providers. It sends a request to the
     * [List Tax Providers](https://docs.medusajs.com/api/admin#tax-providers_gettaxproviders)
     * API route.
     *
     * @since 2.8.0
     *
     * @param query - Filters and pagination configurations.
     * @param headers - Headers to pass in the request.
     * @returns The list of tax providers.
     *
     * @example
     * To retrieve the list of tax providers:
     *
     * ```ts
     * sdk.admin.taxProvider.list()
     * .then(({ tax_providers, count, limit, offset }) => {
     *   console.log(tax_providers)
     * })
     * ```
     *
     * To configure the pagination, pass the `limit` and `offset` query parameters.
     *
     * For example, to retrieve only 10 items and skip 10 items:
     *
     * ```ts
     * sdk.admin.taxProvider.list({
     *   limit: 10,
     *   offset: 10,
     * })
     * .then(({ tax_providers, count, limit, offset }) => {
     *   console.log(tax_providers)
     * })
     * ```
     *
     * Using the `fields` query parameter, you can specify the fields and relations to retrieve
     * in each products:
     *
     * ```ts
     * sdk.admin.taxProvider.list({
     *   fields: "id,*regions"
     * })
     * .then(({ tax_providers, count, limit, offset }) => {
     *   console.log(tax_providers)
     * })
     * ```
     *
     * Learn more about the `fields` property in the [API reference](https://docs.medusajs.com/api/store#select-fields-and-relations).
     */
    list(query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(taxProviderUrl, {
                method: "GET",
                headers,
                query,
            });
        });
    }
}
//# sourceMappingURL=tax-provider.js.map