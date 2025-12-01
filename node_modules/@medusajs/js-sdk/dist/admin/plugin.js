"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plugin = void 0;
class Plugin {
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
    async list(headers) {
        return await this.client.fetch(`/admin/plugins`, {
            headers,
            query: {},
        });
    }
}
exports.Plugin = Plugin;
//# sourceMappingURL=plugin.js.map