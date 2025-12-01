"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Views = void 0;
class Views {
    constructor(client) {
        this.client = client;
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async columns(entity, query, headers) {
        return await this.client.fetch(`/admin/views/${entity}/columns`, {
            method: "GET",
            headers,
            query,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async listConfigurations(entity, query, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations`, {
            method: "GET",
            headers,
            query,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async createConfiguration(entity, body, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations`, {
            method: "POST",
            headers,
            body,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async retrieveConfiguration(entity, id, query, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
            method: "GET",
            headers,
            query,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async updateConfiguration(entity, id, body, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
            method: "POST",
            headers,
            body,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async deleteConfiguration(entity, id, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations/${id}`, {
            method: "DELETE",
            headers,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async retrieveActiveConfiguration(entity, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations/active`, {
            method: "GET",
            headers,
        });
    }
    /**
     * @since 2.10.3
     * @featureFlag view_configurations
     */
    async setActiveConfiguration(entity, body, headers) {
        return await this.client.fetch(`/admin/views/${entity}/configurations/active`, {
            method: "POST",
            headers,
            body,
        });
    }
}
exports.Views = Views;
//# sourceMappingURL=views.js.map