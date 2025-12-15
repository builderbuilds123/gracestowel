"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedusaServiceModelNameToLinkableKeysMapSymbol = exports.MedusaServiceSymbol = exports.MedusaServiceModelObjectsSymbol = void 0;
exports.isMedusaService = isMedusaService;
exports.MedusaService = MedusaService;
const common_1 = require("../common");
const dml_1 = require("../dml");
const event_bus_1 = require("../event-bus");
const create_medusa_mikro_orm_event_subscriber_1 = require("./create-medusa-mikro-orm-event-subscriber");
const decorators_1 = require("./decorators");
const definition_1 = require("./definition");
const event_builder_factory_1 = require("./event-builder-factory");
const joiner_config_builder_1 = require("./joiner-config-builder");
const medusa_internal_service_1 = require("./medusa-internal-service");
const readMethods = ["retrieve", "list", "listAndCount"];
const writeMethods = [
    "delete",
    "softDelete",
    "restore",
    "create",
    "update",
];
const methods = [...readMethods, ...writeMethods];
/**
 * @internal
 */
function buildMethodNamesFromModel(defaultMethodName, model) {
    return methods.reduce((acc, method) => {
        let normalizedModelName = "";
        if (method === "retrieve") {
            normalizedModelName =
                model && "singular" in model && model.singular
                    ? model.singular
                    : defaultMethodName;
        }
        else {
            normalizedModelName =
                model && "plural" in model && model.plural
                    ? model.plural
                    : (0, common_1.pluralize)(defaultMethodName);
        }
        const methodName = `${method}${(0, common_1.upperCaseFirst)(normalizedModelName)}`;
        return { ...acc, [method]: methodName };
    }, {});
}
/**
 * Accessible from the MedusaService, holds the model objects when provided
 */
exports.MedusaServiceModelObjectsSymbol = Symbol.for("MedusaServiceModelObjectsSymbol");
/**
 * Symbol to mark a class as a Medusa service
 */
exports.MedusaServiceSymbol = Symbol.for("MedusaServiceSymbol");
/**
 * Accessible from the MedusaService, holds the model name to linkable keys map
 * to be used for softDelete and restore methods
 */
exports.MedusaServiceModelNameToLinkableKeysMapSymbol = Symbol.for("MedusaServiceModelNameToLinkableKeysMapSymbol");
/**
 * Check if a value is a Medusa service
 * @param value
 */
function isMedusaService(value) {
    return value && value?.prototype[exports.MedusaServiceSymbol];
}
/**
 * Factory function for creating an abstract module service
 *
 * @example
 *
 * // Here the DTO's and names will be inferred from the arguments
 *
 * const models = {
 *   Currency,
 *   Price,
 *   PriceList,
 *   PriceListRule,
 *   PriceListRuleValue,
 *   PriceRule,
 *   PriceSetRuleType,
 *   RuleType,
 * }
 *
 * class MyService extends ModulesSdkUtils.MedusaService(models) {}
 *
 * @param models
 */
function MedusaService(models) {
    var _a, _b;
    const buildAndAssignMethodImpl = function (klassPrototype, method, methodName, modelName) {
        const serviceRegistrationName = `${(0, common_1.lowerCaseFirst)(modelName)}Service`;
        const applyMethod = function (impl, contextIndex) {
            klassPrototype[methodName] = impl;
            const descriptorMockRef = {
                value: klassPrototype[methodName],
            };
            // The order of the decorators is important, do not change it
            (0, decorators_1.MedusaContext)()(klassPrototype, methodName, contextIndex);
            (0, decorators_1.EmitEvents)()(klassPrototype, methodName, descriptorMockRef);
            (0, decorators_1.InjectManager)()(klassPrototype, methodName, descriptorMockRef);
            klassPrototype[methodName] = descriptorMockRef.value;
        };
        let methodImplementation = function () {
            void 0;
        };
        switch (method) {
            case "retrieve":
                methodImplementation = async function (id, config, sharedContext = {}) {
                    const models = await this.__container__[serviceRegistrationName].retrieve(id, config, sharedContext);
                    return await this.baseRepository_.serialize(models);
                };
                applyMethod(methodImplementation, 2);
                break;
            case "create":
                methodImplementation = async function (data = [], sharedContext = {}) {
                    const service = this.__container__[serviceRegistrationName];
                    const models_ = await service.create(data, sharedContext);
                    return await this.baseRepository_.serialize(models_);
                };
                applyMethod(methodImplementation, 1);
                break;
            case "update":
                methodImplementation = async function (data = [], sharedContext = {}) {
                    const service = this.__container__[serviceRegistrationName];
                    const response = await service.update(data, sharedContext);
                    return await this.baseRepository_.serialize(response);
                };
                applyMethod(methodImplementation, 1);
                break;
            case "list":
                methodImplementation = async function (filters = {}, config = {}, sharedContext = {}) {
                    const service = this.__container__[serviceRegistrationName];
                    const models = await service.list(filters, config, sharedContext);
                    return await this.baseRepository_.serialize(models);
                };
                applyMethod(methodImplementation, 2);
                break;
            case "listAndCount":
                methodImplementation = async function (filters = {}, config = {}, sharedContext = {}) {
                    const [models, count] = await this.__container__[serviceRegistrationName].listAndCount(filters, config, sharedContext);
                    return [await this.baseRepository_.serialize(models), count];
                };
                applyMethod(methodImplementation, 2);
                break;
            case "delete":
                methodImplementation = async function (primaryKeyValues, sharedContext = {}) {
                    const primaryKeyValues_ = Array.isArray(primaryKeyValues)
                        ? primaryKeyValues
                        : [primaryKeyValues];
                    await this.__container__[serviceRegistrationName].delete(primaryKeyValues_, sharedContext);
                };
                applyMethod(methodImplementation, 1);
                break;
            case "softDelete":
                methodImplementation = async function (primaryKeyValues, config = {}, sharedContext = {}) {
                    const primaryKeyValues_ = Array.isArray(primaryKeyValues)
                        ? primaryKeyValues
                        : [primaryKeyValues];
                    const [, cascadedModelsMap] = await this.__container__[serviceRegistrationName].softDelete(primaryKeyValues_, sharedContext);
                    // Map internal table/column names to their respective external linkable keys
                    // eg: product.id = product_id, variant.id = variant_id
                    const mappedCascadedModelsMap = (0, common_1.mapObjectTo)(cascadedModelsMap, this[exports.MedusaServiceModelNameToLinkableKeysMapSymbol], {
                        pick: config.returnLinkableKeys,
                    });
                    return mappedCascadedModelsMap ? mappedCascadedModelsMap : void 0;
                };
                applyMethod(methodImplementation, 2);
                break;
            case "restore":
                methodImplementation = async function (primaryKeyValues, config = {}, sharedContext = {}) {
                    const primaryKeyValues_ = Array.isArray(primaryKeyValues)
                        ? primaryKeyValues
                        : [primaryKeyValues];
                    const [, cascadedModelsMap] = await this.__container__[serviceRegistrationName].restore(primaryKeyValues_, sharedContext);
                    let mappedCascadedModelsMap;
                    // Map internal table/column names to their respective external linkable keys
                    // eg: product.id = product_id, variant.id = variant_id
                    mappedCascadedModelsMap = (0, common_1.mapObjectTo)(cascadedModelsMap, this[exports.MedusaServiceModelNameToLinkableKeysMapSymbol], {
                        pick: config.returnLinkableKeys,
                    });
                    return mappedCascadedModelsMap ? mappedCascadedModelsMap : void 0;
                };
                applyMethod(methodImplementation, 2);
                break;
        }
    };
    class AbstractModuleService_ {
        constructor(container) {
            this[_a] = true;
            this.__container__ = container;
            this.baseRepository_ = container.baseRepository;
            const joinerConfig = this.__joinerConfig?.();
            /**
             * Create a global subscriber to listen to all the entities mutations
             * and forward them to the module service interceptEntityMutationEvents
             * method.
             *
             * Assign the global subscriber to all internal services or class that extends it
             * such that it can attach it accordingly and forward the events to the module service.
             */
            if (joinerConfig?.serviceName !== "index") {
                let globalSubscriber;
                Object.keys(container)
                    .filter((key) => {
                    return key.endsWith("Service");
                })
                    .forEach((key) => {
                    globalSubscriber ??= (0, create_medusa_mikro_orm_event_subscriber_1.createMedusaMikroOrmEventSubscriber)(["__medusa_entities_subscriber__"], this);
                    try {
                        const service = container[key];
                        if ((0, medusa_internal_service_1.isMedusaInternalService)(service)) {
                            service.setEventSubscriber(globalSubscriber);
                        }
                    }
                    catch (error) {
                        // Prevent circular issue which in that case would represent ourselves so we can skip
                    }
                });
            }
            const hasEventBusModuleService = Object.keys(this.__container__).find((key) => key === definition_1.Modules.EVENT_BUS);
            this.eventBusModuleService_ = hasEventBusModuleService
                ? this.__container__[definition_1.Modules.EVENT_BUS]
                : undefined;
            this[exports.MedusaServiceModelNameToLinkableKeysMapSymbol] =
                (0, joiner_config_builder_1.buildModelsNameToLinkableKeysMap)(joinerConfig?.linkableKeys ?? {});
        }
        /**
         * @internal this method is meant to react to any event the orm might emit
         * when an entity is being mutated (created, updated, deleted).
         * The default implementation will handle all event to be emitted as part
         * of the message aggregator from the context.
         *
         * If you want to handle the event differently, you can override this method.
         *
         * @example
         *
         * class MyService extends ModulesSdkUtils.MedusaService(models) {
         *   interceptEntityMutationEvents(event: "afterCreate" | "afterUpdate" | "afterUpsert" | "afterDelete", args: EventArgs<any>, context: Context) {
         *     console.log("interceptEntityMutationEvents", event, args.entity)
         *   }
         * }
         *
         * @param event - The event type
         * @param args - The event arguments
         * @param context - The context
         */
        interceptEntityMutationEvents(event, args, context) {
            let action = "";
            switch (event) {
                case "afterCreate":
                    action = event_bus_1.CommonEvents.CREATED;
                    break;
                case "afterUpdate":
                    const isSoftDeleted = !!args.changeSet?.entity.deleted_at &&
                        !args.changeSet?.originalEntity?.deleted_at;
                    const isRestored = !!args.changeSet?.originalEntity?.deleted_at &&
                        !args.changeSet?.entity.deleted_at;
                    action = event_bus_1.CommonEvents.UPDATED;
                    if (isSoftDeleted) {
                        action = event_bus_1.CommonEvents.DELETED;
                    }
                    if (isRestored) {
                        action = event_bus_1.CommonEvents.RESTORED;
                    }
                    break;
                case "afterDelete":
                    action = event_bus_1.CommonEvents.DELETED;
                    break;
            }
            const object = (0, common_1.camelToSnakeCase)(args.meta.className).toLowerCase();
            this.aggregatedEvents({
                action,
                object,
                data: { id: args.entity.id },
                context,
            });
        }
        /**
         * helper function to aggregate events. Will format the message properly and store in
         * the message aggregator from the context. The method must be decorated with `@EmitEvents`
         * @param action
         * @param object
         * @param eventName optional, can be inferred from the module joiner config + action + object
         * @param source optional, can be inferred from the module joiner config
         * @param data
         * @param context
         */
        aggregatedEvents({ action, object, eventName, source, data, context, }) {
            if (!context.messageAggregator) {
                return;
            }
            const __joinerConfig = (typeof this.__joinerConfig === "function"
                ? this.__joinerConfig()
                : this.__joinerConfig);
            const eventBuilder = (0, event_builder_factory_1.moduleEventBuilderFactory)({
                action,
                object,
                source: source || __joinerConfig.serviceName,
                eventName,
            });
            eventBuilder({
                data,
                sharedContext: context,
            });
        }
        /**
         * @internal this method is not meant to be used except by the internal team for now
         * @param groupedEvents
         * @protected
         */
        async emitEvents_(groupedEvents) {
            if (!this.eventBusModuleService_ || !groupedEvents) {
                return;
            }
            const promises = [];
            for (const group of Object.keys(groupedEvents)) {
                promises.push(this.eventBusModuleService_.emit(groupedEvents[group], {
                    internal: true,
                }));
            }
            await Promise.all(promises);
        }
    }
    _a = exports.MedusaServiceSymbol, _b = exports.MedusaServiceModelObjectsSymbol;
    AbstractModuleService_[_b] = models;
    /**
     * Build the retrieve/list/listAndCount/delete/softDelete/restore methods for all the other models
     */
    const modelsMethods = Object.entries(models).map(([name, config]) => [
        dml_1.DmlEntity.isDmlEntity(config) ? config.name : name,
        config,
        buildMethodNamesFromModel(name, config),
    ]);
    for (let [modelName, , modelMethods] of modelsMethods) {
        Object.entries(modelMethods).forEach(([method, methodName]) => {
            buildAndAssignMethodImpl(AbstractModuleService_.prototype, method, methodName, modelName);
        });
    }
    return AbstractModuleService_;
}
//# sourceMappingURL=medusa-service.js.map