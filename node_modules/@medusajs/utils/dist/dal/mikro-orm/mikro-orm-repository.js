"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmBaseTreeRepository = exports.MikroOrmBaseRepository = exports.MikroOrmBase = void 0;
exports.mikroOrmBaseRepositoryFactory = mikroOrmBaseRepositoryFactory;
const core_1 = require("@medusajs/deps/mikro-orm/core");
const common_1 = require("../../common");
const dml_1 = require("../../dml");
const build_query_1 = require("../../modules-sdk/build-query");
const utils_1 = require("../utils");
const db_error_mapper_1 = require("./db-error-mapper");
const mikro_orm_serializer_1 = require("./mikro-orm-serializer");
const utils_2 = require("./utils");
class MikroOrmBase {
    constructor({ manager }) {
        this.manager_ = manager;
    }
    getFreshManager() {
        return (this.manager_.fork
            ? this.manager_.fork()
            : this.manager_);
    }
    getActiveManager({ transactionManager, manager, } = {}) {
        return (transactionManager ?? manager ?? this.getFreshManager());
    }
    async transaction(task, options = {}) {
        const manager = this.getFreshManager();
        return await (0, utils_1.transactionWrapper)(manager, task, options).catch(db_error_mapper_1.dbErrorMapper);
    }
    async serialize(data, options) {
        return await (0, mikro_orm_serializer_1.mikroOrmSerializer)(data, options);
    }
}
exports.MikroOrmBase = MikroOrmBase;
/**
 * Privileged extends of the abstract classes unless most of the methods can't be implemented
 * in your repository. This base repository is also used to provide a base repository
 * injection if needed to be able to use the common methods without being related to an entity.
 * In this case, none of the method will be implemented except the manager and transaction
 * related ones.
 */
class MikroOrmBaseRepository extends MikroOrmBase {
    constructor(...args) {
        // @ts-ignore
        super(...arguments);
    }
    static buildUniqueCompositeKeyValue(keys, data) {
        return keys.map((k) => data[k]).join("_");
    }
    static retrievePrimaryKeys(entity) {
        return (entity.meta?.primaryKeys ??
            entity.prototype.__meta.primaryKeys ?? ["id"]);
    }
    /**
     * When using the select-in strategy, the populated fields are not selected by default unlike when using the joined strategy.
     * This method will add the populated fields to the fields array if they are not already specifically selected.
     *
     * TODO: Revisit if this is still needed in v6 as it seems to be a workaround for a bug in v5
     *
     * @param {FindOptions<any>} findOptions
     */
    static compensateRelationFieldsSelectionFromLoadStrategy({ findOptions, }) {
        const loadStrategy = findOptions?.options?.strategy;
        if (loadStrategy !== core_1.LoadStrategy.SELECT_IN) {
            return;
        }
        findOptions.options ??= {};
        const populate = findOptions.options.populate ?? [];
        const fields = findOptions.options.fields ?? [];
        populate.forEach((populateRelation) => {
            if (fields.some((field) => field.startsWith(populateRelation + "."))) {
                return;
            }
            // If there is no specific fields selected for the relation but the relation is populated, we select all fields
            fields.push(populateRelation + ".*");
        });
    }
    create(data, context) {
        throw new Error("Method not implemented.");
    }
    update(data, context) {
        throw new Error("Method not implemented.");
    }
    delete(idsOrPKs, context) {
        throw new Error("Method not implemented.");
    }
    find(options, context) {
        throw new Error("Method not implemented.");
    }
    findAndCount(options, context) {
        throw new Error("Method not implemented.");
    }
    upsert(data, context = {}) {
        throw new Error("Method not implemented.");
    }
    upsertWithReplace(data, config = {
        relations: [],
    }, context = {}) {
        throw new Error("Method not implemented.");
    }
    async softDelete(filters, sharedContext = {}) {
        const entities = await this.find({ where: filters }, sharedContext);
        const date = new Date();
        const manager = this.getActiveManager(sharedContext);
        const softDeletedEntitiesMap = await (0, utils_2.mikroOrmUpdateDeletedAtRecursively)(manager, entities, date);
        return [entities, Object.fromEntries(softDeletedEntitiesMap)];
    }
    async restore(idsOrFilter, sharedContext = {}) {
        const query = (0, build_query_1.buildQuery)(idsOrFilter, {
            withDeleted: true,
        });
        const entities = await this.find(query, sharedContext);
        const manager = this.getActiveManager(sharedContext);
        const softDeletedEntitiesMap = await (0, utils_2.mikroOrmUpdateDeletedAtRecursively)(manager, entities, null);
        return [entities, Object.fromEntries(softDeletedEntitiesMap)];
    }
}
exports.MikroOrmBaseRepository = MikroOrmBaseRepository;
class MikroOrmBaseTreeRepository extends MikroOrmBase {
    constructor() {
        // @ts-ignore
        super(...arguments);
    }
    find(options, transformOptions, context) {
        throw new Error("Method not implemented.");
    }
    findAndCount(options, transformOptions, context) {
        throw new Error("Method not implemented.");
    }
    create(data, context) {
        throw new Error("Method not implemented.");
    }
    update(data, context) {
        throw new Error("Method not implemented.");
    }
    delete(ids, context) {
        throw new Error("Method not implemented.");
    }
}
exports.MikroOrmBaseTreeRepository = MikroOrmBaseTreeRepository;
function mikroOrmBaseRepositoryFactory(entity) {
    const mikroOrmEntity = (0, dml_1.toMikroORMEntity)(entity);
    class MikroOrmAbstractBaseRepository_ extends MikroOrmBaseRepository {
        // @ts-ignore
        constructor(...args) {
            // @ts-ignore
            super(...arguments);
            this.entity = mikroOrmEntity;
            this.tableName = (mikroOrmEntity.meta ??
                mikroOrmEntity.prototype.__meta).collection;
            return new Proxy(this, {
                get: (target, prop) => {
                    if (typeof target[prop] === "function") {
                        return (...args) => {
                            const res = target[prop].bind(target)(...args);
                            if (res instanceof Promise) {
                                return res.catch(db_error_mapper_1.dbErrorMapper);
                            }
                            return res;
                        };
                    }
                    return target[prop];
                },
            });
        }
        async create(data, context) {
            const manager = this.getActiveManager(context);
            const entities = data.map((data_) => {
                return manager.create(this.entity, data_);
            });
            manager.persist(entities);
            return entities;
        }
        /**
         * On a many to many relation, we expect to detach all the pivot items in case an empty array is provided.
         * In that case, this relation needs to be init as well as its counter part in order to be
         * able to perform the removal action.
         *
         * This action performs the initialization in the provided entity and therefore mutate in place.
         *
         * @param {{entity, update}[]} data
         * @param context
         * @private
         */
        async initManyToManyToDetachAllItemsIfNeeded(data, context) {
            const manager = this.getActiveManager(context);
            const relations = manager
                .getDriver()
                .getMetadata()
                .get(this.entity.name).relations;
            // In case an empty array is provided for a collection relation of type m:n, this relation needs to be init in order to be
            // able to perform an application cascade action.
            const collectionsToRemoveAllFrom = new Map();
            data.forEach(({ update }) => Object.keys(update).filter((key) => {
                const relation = relations.find((relation) => relation.name === key);
                const shouldInit = relation &&
                    relation.kind === core_1.ReferenceKind.MANY_TO_MANY &&
                    Array.isArray(update[key]) &&
                    !update[key].length;
                if (shouldInit) {
                    collectionsToRemoveAllFrom.set(key, {
                        name: key,
                        mappedBy: relations.find((r) => r.name === key)?.mappedBy,
                    });
                }
            }));
            for (const [collectionToRemoveAllFrom, descriptor,] of collectionsToRemoveAllFrom) {
                await (0, common_1.promiseAll)(data.flatMap(async ({ entity }) => {
                    if (!descriptor.mappedBy) {
                        return await entity[collectionToRemoveAllFrom].init();
                    }
                    const promises = [];
                    await entity[collectionToRemoveAllFrom].init();
                    const items = entity[collectionToRemoveAllFrom];
                    for (const item of items) {
                        promises.push(item[descriptor.mappedBy].init());
                    }
                    return promises;
                }));
            }
        }
        async update(data, context) {
            const manager = this.getActiveManager(context);
            await this.initManyToManyToDetachAllItemsIfNeeded(data, context);
            data.forEach(({ entity, update }) => {
                manager.assign(entity, update, {
                    mergeObjectProperties: true,
                });
                manager.persist(entity);
            });
            return data.map((d) => d.entity);
        }
        async delete(filters, context) {
            const manager = this.getActiveManager(context);
            const whereSqlInfo = manager
                .createQueryBuilder(this.entity.name, this.tableName)
                .where(filters)
                .getKnexQuery()
                .toSQL();
            const builder = (manager.getTransactionContext() ?? manager.getKnex())
                .queryBuilder()
                .from(this.tableName)
                .delete();
            const hasWhere = whereSqlInfo.sql.includes("where ");
            if (hasWhere) {
                const where = [
                    whereSqlInfo.sql.split("where ")[1],
                    whereSqlInfo.bindings,
                ];
                builder.where(manager.getKnex().raw(...where));
            }
            return await builder.returning("id").then((rows) => {
                return rows.map((row) => row.id);
            });
        }
        async find(options = { where: {} }, context) {
            const manager = this.getActiveManager(context);
            const findOptions_ = { ...options };
            findOptions_.options ??= {};
            if (!("strategy" in findOptions_.options)) {
                if (findOptions_.options.limit != null || findOptions_.options.offset) {
                    // TODO: from 7+ it will be the default strategy
                    Object.assign(findOptions_.options, {
                        strategy: core_1.LoadStrategy.SELECT_IN,
                    });
                }
            }
            MikroOrmBaseRepository.compensateRelationFieldsSelectionFromLoadStrategy({
                findOptions: findOptions_,
            });
            return (await manager.find(this.entity, findOptions_.where, findOptions_.options));
        }
        async findAndCount(findOptions = { where: {} }, context = {}) {
            const manager = this.getActiveManager(context);
            const findOptions_ = { ...findOptions };
            findOptions_.options ??= {};
            if (!("strategy" in findOptions_.options)) {
                if (findOptions_.options.limit != null || findOptions_.options.offset) {
                    // TODO: from 7+ it will be the default strategy
                    Object.assign(findOptions_.options, {
                        strategy: core_1.LoadStrategy.SELECT_IN,
                    });
                }
            }
            MikroOrmBaseRepository.compensateRelationFieldsSelectionFromLoadStrategy({
                findOptions: findOptions_,
            });
            return (await manager.findAndCount(this.entity, findOptions_.where, findOptions_.options // MikroOptions<T>
            ));
        }
        async upsert(data, context = {}) {
            const manager = this.getActiveManager(context);
            const primaryKeys = MikroOrmAbstractBaseRepository_.retrievePrimaryKeys(this.entity);
            let primaryKeysCriteria = [];
            if (primaryKeys.length === 1) {
                const primaryKeyValues = data
                    .map((d) => d[primaryKeys[0]])
                    .filter(Boolean);
                if (primaryKeyValues.length) {
                    primaryKeysCriteria.push({
                        [primaryKeys[0]]: primaryKeyValues,
                    });
                }
            }
            else {
                primaryKeysCriteria = data.map((d) => ({
                    $and: primaryKeys.map((key) => ({ [key]: d[key] })),
                }));
            }
            let allEntities = [];
            if (primaryKeysCriteria.length) {
                allEntities = await (0, common_1.promiseAll)(primaryKeysCriteria.map(async (criteria) => await this.find({ where: criteria }, context)));
            }
            const existingEntities = allEntities.flat();
            const existingEntitiesMap = new Map();
            existingEntities.forEach((entity) => {
                if (entity) {
                    const key = MikroOrmAbstractBaseRepository_.buildUniqueCompositeKeyValue(primaryKeys, entity);
                    existingEntitiesMap.set(key, entity);
                }
            });
            const upsertedEntities = [];
            const createdEntities = [];
            const updatedEntities = [];
            data.forEach((data_) => {
                // In case the data provided are just strings, then we build an object with the primary key as the key and the data as the valuecd -
                const key = MikroOrmAbstractBaseRepository_.buildUniqueCompositeKeyValue(primaryKeys, data_);
                const existingEntity = existingEntitiesMap.get(key);
                if (existingEntity) {
                    const updatedType = manager.assign(existingEntity, data_);
                    updatedEntities.push(updatedType);
                }
                else {
                    const newEntity = manager.create(this.entity, data_);
                    createdEntities.push(newEntity);
                }
            });
            if (createdEntities.length) {
                manager.persist(createdEntities);
                upsertedEntities.push(...createdEntities);
            }
            if (updatedEntities.length) {
                manager.persist(updatedEntities);
                upsertedEntities.push(...updatedEntities);
            }
            // TODO return the all, created, updated entities
            return upsertedEntities;
        }
        // UpsertWithReplace does several things to simplify module implementation.
        // For each entry of your base entity, it will go through all one-to-many and many-to-many relations, and it will do a diff between what is passed and what is in the database.
        // For each relation, it create new entries (without an ID), it will associate existing entries (with only an ID), and it will update existing entries (with an ID and other fields).
        // Finally, it will delete the relation entries that were omitted in the new data.
        // The response is a POJO of the data that was written to the DB, including all new IDs. The order is preserved with the input.
        // Limitations: We expect that IDs are used as primary keys, and we don't support composite keys.
        // We only support 1-level depth of upserts. We don't support custom fields on the many-to-many pivot tables for now
        async upsertWithReplace(data, config = {
            relations: [],
        }, context = {}) {
            const performedActions = {
                created: {},
                updated: {},
                deleted: {},
            };
            if (!data.length) {
                return { entities: [], performedActions };
            }
            // We want to convert a potential ORM model to a POJO
            const normalizedData = await this.serialize(data);
            const manager = this.getActiveManager(context);
            // Handle the relations
            const allRelations = manager
                .getDriver()
                .getMetadata()
                .get(this.entity.name).relations;
            const nonexistentRelations = (0, common_1.arrayDifference)(config.relations ?? [], allRelations.map((r) => r.name));
            if (nonexistentRelations.length) {
                throw new common_1.MedusaError(common_1.MedusaError.Types.INVALID_DATA, `Nonexistent relations were passed during upsert: ${nonexistentRelations}`);
            }
            // We want to response with all the data including the IDs in the same order as the input. We also include data that was passed but not processed.
            const reconstructedResponse = [];
            const originalDataMap = new Map();
            // Create only the top-level entity without the relations first
            const toUpsert = normalizedData.map((entry) => {
                // Make a copy of the data and remove undefined fields. The data is already a POJO due to the serialization above
                const entryCopy = JSON.parse(JSON.stringify(entry));
                const reconstructedEntry = {};
                allRelations?.forEach((relation) => {
                    reconstructedEntry[relation.name] = this.handleRelationAssignment_(relation, entryCopy);
                });
                const mainEntity = this.getEntityWithId(manager, this.entity.name, entryCopy);
                reconstructedResponse.push({ ...mainEntity, ...reconstructedEntry });
                originalDataMap.set(mainEntity.id, entry);
                return mainEntity;
            });
            let { orderedEntities: upsertedTopLevelEntities, performedActions: performedActions_, } = await this.upsertMany_(manager, this.entity.name, toUpsert);
            this.mergePerformedActions(performedActions, performedActions_);
            const relationProcessingPromises = [];
            // Group relations by type
            const relationsByType = new Map();
            config.relations?.forEach((relationName) => {
                const relation = allRelations?.find((r) => r.name === relationName);
                if (!relation)
                    return;
                if (relation.kind === core_1.ReferenceKind.ONE_TO_ONE ||
                    relation.kind === core_1.ReferenceKind.MANY_TO_ONE) {
                    return;
                }
                const entitiesForRelation = upsertedTopLevelEntities
                    .map((entityEntry, i) => {
                    const originalEntry = originalDataMap.get(entityEntry.id);
                    return {
                        entity: { ...originalEntry, id: entityEntry.id },
                        reconstructedEntry: reconstructedResponse[i],
                        index: i,
                    };
                })
                    .filter((item) => item.entity[relationName] !== undefined);
                if (entitiesForRelation.length > 0) {
                    relationsByType.set(relationName, {
                        relation,
                        entities: entitiesForRelation,
                    });
                }
            });
            for (const [relationName, { relation, entities }] of relationsByType) {
                relationProcessingPromises.push(this.assignCollectionRelationBatch_(manager, entities, relation).then(({ performedActions: batchPerformedActions, entitiesResults }) => {
                    this.mergePerformedActions(performedActions, batchPerformedActions);
                    // Update reconstructed response with results
                    entitiesResults.forEach(({ entities: relationEntities, index }) => {
                        reconstructedResponse[index][relationName] = relationEntities;
                    });
                }));
            }
            await (0, common_1.promiseAll)(relationProcessingPromises);
            return { entities: reconstructedResponse, performedActions };
        }
        mergePerformedActions(performedActions, newPerformedActions) {
            Object.entries(newPerformedActions).forEach(([action, entities]) => {
                Object.entries(entities).forEach(([entityName, entityData]) => {
                    performedActions[action][entityName] ??= [];
                    performedActions[action][entityName].push(...entityData);
                });
            });
        }
        /**
         * Batch processing for multiple entities with same relation
         */
        async assignCollectionRelationBatch_(manager, entitiesData, relation) {
            const performedActions = {
                created: {},
                updated: {},
                deleted: {},
            };
            const entitiesResults = [];
            if (relation.kind === core_1.ReferenceKind.MANY_TO_MANY) {
                await this.assignManyToManyRelationBatch_(manager, entitiesData, relation, performedActions, entitiesResults);
            }
            else if (relation.kind === core_1.ReferenceKind.ONE_TO_MANY) {
                await this.assignOneToManyRelationBatch_(manager, entitiesData, relation, performedActions, entitiesResults);
            }
            else {
                // For other relation types, fall back to individual processing
                await (0, common_1.promiseAll)(entitiesData.map(async ({ entity, index }) => {
                    const { entities, performedActions: individualActions } = await this.assignCollectionRelation_(manager, entity, relation);
                    this.mergePerformedActions(performedActions, individualActions);
                    entitiesResults.push({ entities, index });
                }));
            }
            return { performedActions, entitiesResults };
        }
        /**
         * Batch processing for many-to-many relations
         */
        async assignManyToManyRelationBatch_(manager, entitiesData, relation, performedActions, entitiesResults) {
            const currentPivotColumn = relation.inverseJoinColumns[0];
            const parentPivotColumn = relation.joinColumns[0];
            // Collect all relation data and normalize it
            const allNormalizedData = [];
            const entityRelationMap = new Map();
            const entitiesToDeletePivots = [];
            for (const { entity, index } of entitiesData) {
                const dataForRelation = entity[relation.name];
                if (dataForRelation === undefined) {
                    entitiesResults.push({ entities: [], index });
                    continue;
                }
                if (!dataForRelation.length) {
                    entitiesToDeletePivots.push(entity.id);
                    entitiesResults.push({ entities: [], index });
                    continue;
                }
                const normalizedData = dataForRelation.map((item) => this.getEntityWithId(manager, relation.type, item));
                allNormalizedData.push(...normalizedData);
                entityRelationMap.set(entity.id, normalizedData);
                entitiesResults.push({ entities: normalizedData, index });
            }
            // Batch delete empty pivot relations
            if (entitiesToDeletePivots.length) {
                await manager.nativeDelete(relation.pivotEntity, {
                    [parentPivotColumn]: { $in: entitiesToDeletePivots },
                });
            }
            if (allNormalizedData.length) {
                const { performedActions: upsertActions } = await this.upsertMany_(manager, relation.type, allNormalizedData, true);
                this.mergePerformedActions(performedActions, upsertActions);
                // Collect all pivot data for batch operations
                const allPivotData = [];
                const allParentIds = [];
                for (const [parentId, normalizedData] of entityRelationMap) {
                    allParentIds.push(parentId);
                    const pivotData = normalizedData.map((currModel) => ({
                        [parentPivotColumn]: parentId,
                        [currentPivotColumn]: currModel.id,
                    }));
                    allPivotData.push(...pivotData);
                }
                // Batch insert and delete pivot table entries
                await (0, common_1.promiseAll)([
                    manager
                        .qb(relation.pivotEntity)
                        .insert(allPivotData)
                        .onConflict()
                        .ignore()
                        .execute(),
                    manager.nativeDelete(relation.pivotEntity, {
                        [parentPivotColumn]: { $in: allParentIds },
                        [currentPivotColumn]: {
                            $nin: allPivotData.map((d) => d[currentPivotColumn]),
                        },
                    }),
                ]);
            }
        }
        /**
         * Batch processing for one-to-many relations
         */
        async assignOneToManyRelationBatch_(manager, entitiesData, relation, performedActions, entitiesResults) {
            const joinColumns = relation.targetMeta?.properties[relation.mappedBy]?.joinColumns;
            // Collect all relation data and constraints
            const allNormalizedData = [];
            const allJoinConstraints = [];
            const allEntityIds = [];
            for (const { entity, index } of entitiesData) {
                const dataForRelation = entity[relation.name];
                if (dataForRelation === undefined) {
                    entitiesResults.push({ entities: [], index });
                    continue;
                }
                const joinColumnsConstraints = {};
                joinColumns?.forEach((joinColumn, index) => {
                    const referencedColumnName = relation.referencedColumnNames[index];
                    joinColumnsConstraints[joinColumn] = entity[referencedColumnName];
                });
                const normalizedData = dataForRelation.map((item) => {
                    const normalized = this.getEntityWithId(manager, relation.type, item);
                    return { ...normalized, ...joinColumnsConstraints };
                });
                allNormalizedData.push(...normalizedData);
                allJoinConstraints.push(joinColumnsConstraints);
                allEntityIds.push(...normalizedData.map((d) => d.id));
                entitiesResults.push({ entities: normalizedData, index });
            }
            // Batch delete orphaned relations
            if (allJoinConstraints.length) {
                const deletedRelations = await (manager.getTransactionContext() ?? manager.getKnex())
                    .queryBuilder()
                    .from(relation.targetMeta.collection)
                    .delete()
                    .where((builder) => {
                    allJoinConstraints.forEach((constraints, index) => {
                        if (index === 0) {
                            builder.where(constraints);
                        }
                        else {
                            builder.orWhere(constraints);
                        }
                    });
                })
                    .whereNotIn("id", allEntityIds)
                    .returning("id");
                if (deletedRelations.length) {
                    performedActions.deleted[relation.type] ??= [];
                    performedActions.deleted[relation.type].push(...deletedRelations.map((row) => ({ id: row.id })));
                }
            }
            // Batch upsert all relation entities
            if (allNormalizedData.length) {
                const { performedActions: upsertActions } = await this.upsertMany_(manager, relation.type, allNormalizedData);
                this.mergePerformedActions(performedActions, upsertActions);
            }
        }
        async assignCollectionRelation_(manager, data, relation) {
            const dataForRelation = data[relation.name];
            const performedActions = {
                created: {},
                updated: {},
                deleted: {},
            };
            // If the field is not set, we ignore it. Null and empty arrays are a valid input and are handled below
            if (dataForRelation === undefined) {
                return { entities: [], performedActions };
            }
            // Make sure the data is correctly initialized with IDs before using it
            const normalizedData = dataForRelation.map((normalizedItem) => {
                return this.getEntityWithId(manager, relation.type, normalizedItem);
            });
            if (relation.kind === core_1.ReferenceKind.MANY_TO_MANY) {
                const currentPivotColumn = relation.inverseJoinColumns[0];
                const parentPivotColumn = relation.joinColumns[0];
                if (!normalizedData.length) {
                    await manager.nativeDelete(relation.pivotEntity, {
                        [parentPivotColumn]: data.id,
                    });
                    return { entities: normalizedData, performedActions };
                }
                const { performedActions: performedActions_ } = await this.upsertMany_(manager, relation.type, normalizedData, true);
                this.mergePerformedActions(performedActions, performedActions_);
                const pivotData = normalizedData.map((currModel) => {
                    return {
                        [parentPivotColumn]: data.id,
                        [currentPivotColumn]: currModel.id,
                    };
                });
                await (0, common_1.promiseAll)([
                    manager
                        .qb(relation.pivotEntity)
                        .insert(pivotData)
                        .onConflict()
                        .ignore()
                        .execute(),
                    manager.nativeDelete(relation.pivotEntity, {
                        [parentPivotColumn]: data.id,
                        [currentPivotColumn]: {
                            $nin: pivotData.map((d) => d[currentPivotColumn]),
                        },
                    }),
                ]);
                return { entities: normalizedData, performedActions };
            }
            if (relation.kind === core_1.ReferenceKind.ONE_TO_MANY) {
                const joinColumns = relation.targetMeta?.properties[relation.mappedBy]?.joinColumns;
                const joinColumnsConstraints = {};
                joinColumns?.forEach((joinColumn, index) => {
                    const referencedColumnName = relation.referencedColumnNames[index];
                    joinColumnsConstraints[joinColumn] = data[referencedColumnName];
                });
                const deletedRelations = await (manager.getTransactionContext() ?? manager.getKnex())
                    .queryBuilder()
                    .from(relation.targetMeta.collection)
                    .delete()
                    .where(joinColumnsConstraints)
                    .whereNotIn("id", normalizedData.map((d) => d.id))
                    .returning("id");
                if (deletedRelations.length) {
                    performedActions.deleted[relation.type] ??= [];
                    performedActions.deleted[relation.type].push(...deletedRelations.map((row) => ({ id: row.id })));
                }
                if (normalizedData.length) {
                    normalizedData.forEach((normalizedDataItem) => {
                        Object.assign(normalizedDataItem, {
                            ...joinColumnsConstraints,
                        });
                    });
                    const { performedActions: performedActions_ } = await this.upsertMany_(manager, relation.type, normalizedData);
                    this.mergePerformedActions(performedActions, performedActions_);
                }
                return { entities: normalizedData, performedActions };
            }
            return { entities: normalizedData, performedActions };
        }
        handleRelationAssignment_(relation, entryCopy) {
            const originalData = entryCopy[relation.name];
            delete entryCopy[relation.name];
            if (originalData === undefined) {
                return undefined;
            }
            // If it is a many-to-one we ensure the ID is set for when we want to set/unset an association
            if (relation.kind === core_1.ReferenceKind.MANY_TO_ONE) {
                if (originalData === null) {
                    entryCopy[relation.joinColumns[0]] = null;
                    return null;
                }
                // The relation can either be a primitive or the entity object, depending on how it's defined on the model
                let relationId;
                if ((0, common_1.isString)(originalData)) {
                    relationId = originalData;
                }
                else if ("id" in originalData) {
                    relationId = originalData.id;
                }
                // We don't support creating many-to-one relations, so we want to throw if someone doesn't pass the ID
                if (!relationId) {
                    throw new common_1.MedusaError(common_1.MedusaError.Types.INVALID_DATA, `Many-to-one relation ${relation.name} must be set with an ID`);
                }
                entryCopy[relation.joinColumns[0]] = relationId;
                return originalData;
            }
            return undefined;
        }
        // Returns a POJO object with the ID populated from the entity model hooks
        getEntityWithId(manager, entityName, data) {
            // We set the id to undefined to make sure the entity isn't fetched from the entity map if it is an update,
            // giving us incorrect data for the bignumberdata field (I though managed: false and persist: false would already do this)
            const created = manager.create(entityName, { ...data, id: undefined }, {
                managed: false,
                persist: false,
            });
            const resp = {
                // `create` will omit non-existent fields, but we want to pass the data the user provided through so the correct errors get thrown
                ...data,
                ...created.__helper.__bignumberdata,
                id: data.id ?? created.id,
            };
            // Non-persist relation columns should be removed before we do the upsert.
            Object.entries(created.__helper?.__meta.properties ?? {})
                .filter(([_, propDef]) => propDef.persist === false &&
                propDef.kind === core_1.ReferenceKind.MANY_TO_ONE)
                .forEach(([key]) => {
                delete resp[key];
            });
            return resp;
        }
        async upsertMany_(manager, entityName, entries, skipUpdate = false) {
            if (!entries.length) {
                return {
                    orderedEntities: [],
                    performedActions: { created: {}, updated: {}, deleted: {} },
                };
            }
            const uniqueEntriesMap = new Map();
            const orderedUniqueEntries = [];
            entries.forEach((entry) => {
                if (!uniqueEntriesMap.has(entry.id)) {
                    uniqueEntriesMap.set(entry.id, entry);
                    orderedUniqueEntries.push(entry);
                }
            });
            const existingEntitiesMap = new Map();
            if (orderedUniqueEntries.some((e) => e.id)) {
                const existingEntities = await manager
                    .qb(entityName)
                    .select("id")
                    .where({
                    id: { $in: orderedUniqueEntries.map((d) => d.id).filter(Boolean) },
                });
                existingEntities.forEach((e) => {
                    existingEntitiesMap.set(e.id, e);
                });
            }
            const orderedEntities = [];
            const performedActions = {
                created: {},
                updated: {},
                deleted: {},
            };
            const toInsert = [];
            const toUpdate = [];
            const insertOrderMap = new Map();
            const updateOrderMap = new Map();
            // Single pass to categorize operations while preserving order
            orderedUniqueEntries.forEach((data, index) => {
                const existingEntity = existingEntitiesMap.get(data.id);
                orderedEntities.push(data);
                if (existingEntity) {
                    if (!skipUpdate) {
                        toUpdate.push(data);
                        updateOrderMap.set(data.id, index);
                    }
                }
                else {
                    toInsert.push(data);
                    insertOrderMap.set(data.id, index);
                }
            });
            const promises = [];
            if (toInsert.length > 0) {
                let insertQb = manager.qb(entityName).insert(toInsert).returning("id");
                if (skipUpdate) {
                    insertQb = insertQb.onConflict().ignore();
                }
                promises.push(insertQb.execute("all", true).then((res) => {
                    performedActions.created[entityName] ??= [];
                    // Sort created entities by their original insertion order
                    const sortedCreated = res
                        .map((data) => ({
                        ...data,
                        order: insertOrderMap.get(data.id) ?? Number.MAX_SAFE_INTEGER,
                    }))
                        .sort((a, b) => a.order - b.order)
                        .map(({ order, ...data }) => data);
                    performedActions.created[entityName].push(...sortedCreated);
                }));
            }
            if (toUpdate.length > 0) {
                // Use batch update but maintain order
                const batchSize = 100; // Process in chunks to avoid query size limits
                const updatePromises = [];
                const allUpdatedEntities = [];
                for (let i = 0; i < toUpdate.length; i += batchSize) {
                    const chunk = toUpdate.slice(i, i + batchSize);
                    updatePromises.push(manager
                        .getDriver()
                        .nativeUpdateMany(entityName, chunk.map((d) => ({ id: d.id })), chunk, { ctx: manager.getTransactionContext() })
                        .then((res) => {
                        const updatedRows = res.rows ?? [];
                        // Add order information for sorting later
                        const orderedUpdated = updatedRows.map((d) => ({
                            id: d.id,
                            order: updateOrderMap.get(d.id) ?? Number.MAX_SAFE_INTEGER,
                        }));
                        allUpdatedEntities.push(...orderedUpdated);
                    }));
                }
                promises.push((0, common_1.promiseAll)(updatePromises).then(() => {
                    // Sort all updated entities by their original order and add to performedActions
                    performedActions.updated[entityName] ??= [];
                    const sortedUpdated = allUpdatedEntities
                        .sort((a, b) => a.order - b.order)
                        .map(({ order, ...data }) => data);
                    performedActions.updated[entityName].push(...sortedUpdated);
                }));
            }
            await (0, common_1.promiseAll)(promises);
            return { orderedEntities, performedActions };
        }
        async restore(filters, sharedContext = {}) {
            if (Array.isArray(filters) && !filters.filter(Boolean).length) {
                return [[], {}];
            }
            if (!filters) {
                return [[], {}];
            }
            const normalizedFilters = this.normalizeFilters(filters);
            return await super.restore(normalizedFilters, sharedContext);
        }
        async softDelete(filters, sharedContext = {}) {
            if (Array.isArray(filters) && !filters.filter(Boolean).length) {
                return [[], {}];
            }
            if (!filters) {
                return [[], {}];
            }
            const normalizedFilters = this.normalizeFilters(filters);
            return await super.softDelete(normalizedFilters, sharedContext);
        }
        normalizeFilters(filters) {
            const primaryKeys = MikroOrmAbstractBaseRepository_.retrievePrimaryKeys(this.entity);
            const filterArray = Array.isArray(filters) ? filters : [filters];
            const normalizedFilters = {
                $or: filterArray.map((filter) => {
                    // TODO: add support for composite keys
                    if ((0, common_1.isString)(filter)) {
                        return { [primaryKeys[0]]: filter };
                    }
                    return filter;
                }),
            };
            return normalizedFilters;
        }
    }
    return MikroOrmAbstractBaseRepository_;
}
//# sourceMappingURL=mikro-orm-repository.js.map