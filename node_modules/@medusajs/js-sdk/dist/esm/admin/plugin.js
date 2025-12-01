var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class Plugin {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
    /**
     * This method retrieves the list of plugins installed in a Medusa application.
     *
     * @param headers - Headers to pass in the request.
     * @returns The list of plugins.
     *
     * @example
     * sdk.admin.plugin.list()
     * .then(({ plugins }) => {
     *   console.log(plugins)
     * })
     */
    list(headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/plugins`, {
                headers,
                query: {},
            });
        });
    }
}
//# sourceMappingURL=plugin.js.map