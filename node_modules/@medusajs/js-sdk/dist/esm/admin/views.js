var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class Views {
    constructor(client) {
        this.client = client;
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    columns(entity, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/columns`, {
                method: "GET",
                headers,
                query,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    listConfigurations(entity, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations`, {
                method: "GET",
                headers,
                query,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    createConfiguration(entity, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    retrieveConfiguration(entity, id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
                method: "GET",
                headers,
                query,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    updateConfiguration(entity, id, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    deleteConfiguration(entity, id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    retrieveActiveConfiguration(entity, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations/active`, {
                method: "GET",
                headers,
            });
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    setActiveConfiguration(entity, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.fetch(`/admin/views/${entity}/configurations/active`, {
                method: "POST",
                headers,
                body,
            });
        });
    }
}
//# sourceMappingURL=views.js.map