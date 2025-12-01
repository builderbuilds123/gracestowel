"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mikroOrmSerializer = exports.EntitySerializer = void 0;
const core_1 = require("@medusajs/deps/mikro-orm/core");
const STATIC_OPTIONS_SHAPE = {
    populate: true,
    exclude: undefined,
    preventCircularRef: true,
    skipNull: undefined,
    ignoreSerializers: undefined,
    forceObject: true,
};
const EMPTY_ARRAY = Object.freeze([]);
const WILDCARD = "*";
const DOT = ".";
const UNDERSCORE = "_";
function isVisible(propName, populate, exclude, meta) {
    if (populate === true)
        return true;
    if (exclude && exclude.includes(propName))
        return false;
    if (Array.isArray(populate)) {
        const populateLength = populate.length;
        const propNameLength = propName.length;
        for (let i = 0; i < populateLength; i++) {
            const item = populate[i];
            if (item === WILDCARD)
                return true;
            if (item === propName)
                return true;
            if (item.length > propNameLength && item[propNameLength] === DOT) {
                if (item.slice(0, propNameLength) === propName)
                    return true;
            }
        }
    }
    const prop = meta[propName];
    const visible = (prop && !prop.hidden) || prop === undefined;
    const prefixed = prop && !prop.primary && propName.charAt(0) === UNDERSCORE;
    return visible && !prefixed;
}
function isPopulated(propName, populate) {
    if (populate === true)
        return true;
    if (populate === false || !Array.isArray(populate))
        return false;
    const propNameLength = propName.length;
    const populateLength = populate.length;
    for (let i = 0; i < populateLength; i++) {
        const item = populate[i];
        if (item === WILDCARD || item === propName)
            return true;
        if (item.length > propNameLength && item[propNameLength] === DOT) {
            if (item.slice(0, propNameLength) === propName)
                return true;
        }
    }
    return false;
}
class RequestScopedSerializationContext {
    constructor() {
        this.propertyNameCache = new Map();
        this.visitedEntities = new WeakSet();
        //  The buffer essentially replaces what would otherwise be a Set → Array conversion with a more
        //  efficient pre-allocated array approach, while maintaining the
        //  deduplication logic via the separate seenKeys Set.
        this.keyCollectionBuffer = new Array(100); // Pre-allocated buffer for key collection
        this.keyBufferIndex = 0;
        this.propertyNameCache.set("id", "id");
        this.propertyNameCache.set("created_at", "created_at");
        this.propertyNameCache.set("updated_at", "updated_at");
        this.propertyNameCache.set("deleted_at", "deleted_at");
    }
    resetKeyBuffer() {
        this.keyBufferIndex = 0;
    }
    addKey(key) {
        if (this.keyBufferIndex < this.keyCollectionBuffer.length) {
            this.keyCollectionBuffer[this.keyBufferIndex++] = key;
        }
        else {
            this.keyCollectionBuffer.push(key);
            this.keyBufferIndex++;
        }
    }
    getKeys() {
        // Avoid slice allocation if buffer is exactly full
        if (this.keyBufferIndex === this.keyCollectionBuffer.length) {
            return this.keyCollectionBuffer;
        }
        return this.keyCollectionBuffer.slice(0, this.keyBufferIndex);
    }
}
class EntitySerializer {
    static serialize(entity, options = STATIC_OPTIONS_SHAPE, parents = EMPTY_ARRAY, requestCtx) {
        const ctx = requestCtx ?? new RequestScopedSerializationContext();
        const wrapped = (0, core_1.helper)(entity);
        const meta = wrapped.__meta;
        let contextCreated = false;
        const populate = options.populate ?? STATIC_OPTIONS_SHAPE.populate;
        const exclude = options.exclude;
        const skipNull = options.skipNull ?? STATIC_OPTIONS_SHAPE.skipNull;
        const preventCircularRef = options.preventCircularRef ?? STATIC_OPTIONS_SHAPE.preventCircularRef;
        const ignoreSerializers = options.ignoreSerializers ?? STATIC_OPTIONS_SHAPE.ignoreSerializers;
        const forceObject = options.forceObject ?? STATIC_OPTIONS_SHAPE.forceObject;
        const serializationContext = wrapped.__serializationContext;
        if (!serializationContext.root) {
            const root = new core_1.SerializationContext({});
            core_1.SerializationContext.propagate(root, entity, (meta, prop) => meta.properties[prop]?.kind !== core_1.ReferenceKind.SCALAR);
            contextCreated = true;
        }
        const root = serializationContext.root;
        const ret = {};
        ctx.resetKeyBuffer();
        const seenKeys = new Set();
        const primaryKeys = meta.primaryKeys;
        const primaryKeysLength = primaryKeys.length;
        const entityKeys = Object.keys(entity);
        const entityKeysLength = entityKeys.length;
        const metaPropertyKeys = Object.keys(meta.properties);
        const metaPropertyKeysLength = metaPropertyKeys.length;
        for (let i = 0; i < primaryKeysLength; i++) {
            const key = primaryKeys[i];
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                ctx.addKey(key);
            }
        }
        for (let i = 0; i < entityKeysLength; i++) {
            const key = entityKeys[i];
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                ctx.addKey(key);
            }
        }
        for (let i = 0; i < metaPropertyKeysLength; i++) {
            const key = metaPropertyKeys[i];
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                ctx.addKey(key);
            }
        }
        const allKeys = ctx.getKeys();
        const allKeysLength = allKeys.length;
        let hasComplexProperties = false;
        const metaProperties = meta.properties;
        for (let i = 0; i < allKeysLength; i++) {
            const prop = allKeys[i];
            const propMeta = metaProperties[prop];
            if (propMeta && propMeta.kind !== core_1.ReferenceKind.SCALAR) {
                hasComplexProperties = true;
                break;
            }
        }
        if (!hasComplexProperties && populate === true) {
            for (let i = 0; i < allKeysLength; i++) {
                const prop = allKeys[i];
                const propValue = entity[prop];
                if (propValue !== undefined && !(propValue === null && skipNull)) {
                    ret[prop] = propValue;
                }
            }
            if (contextCreated)
                root.close();
            return ret;
        }
        const visited = root.visited.has(entity);
        if (!visited)
            root.visited.add(entity);
        const className = meta.className;
        const platform = wrapped.__platform;
        for (let i = 0; i < allKeysLength; i++) {
            const prop = allKeys[i];
            const isPropertyVisible = isVisible(prop, populate, exclude, metaProperties);
            if (!isPropertyVisible)
                continue;
            const propMeta = metaProperties[prop];
            let shouldSerialize = true;
            if (propMeta &&
                preventCircularRef &&
                propMeta.kind !== core_1.ReferenceKind.SCALAR) {
                if (!propMeta.mapToPk) {
                    const propType = propMeta.type;
                    const parentsLength = parents.length;
                    for (let j = 0; j < parentsLength; j++) {
                        if (parents[j] === propType) {
                            shouldSerialize = false;
                            break;
                        }
                    }
                }
            }
            if (!shouldSerialize)
                continue;
            const cycle = root.visit(className, prop);
            if (cycle && visited)
                continue;
            const val = this.processProperty(prop, entity, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, parents, ctx);
            if (!cycle)
                root.leave(className, prop);
            if (val !== undefined && !(val === null && skipNull)) {
                let propName;
                if (propMeta?.serializedName) {
                    propName = propMeta.serializedName;
                }
                else if (propMeta?.primary && platform) {
                    propName = platform.getSerializedPrimaryKeyField(prop);
                }
                else {
                    propName = prop;
                }
                ret[propName] = val;
            }
        }
        if (contextCreated)
            root.close();
        if (!wrapped.isInitialized())
            return ret;
        const metaProps = meta.props;
        const metaPropsLength = metaProps.length;
        for (let i = 0; i < metaPropsLength; i++) {
            const prop = metaProps[i];
            const propName = prop.name;
            if (!isVisible(propName, populate, exclude, meta.properties))
                continue;
            let propertyKey;
            let shouldProcess = false;
            if (prop.getter && !prop.getterName && entity[propName] !== undefined) {
                propertyKey = propName;
                shouldProcess = true;
            }
            else if (prop.getterName &&
                typeof entity[prop.getterName] === "function") {
                propertyKey = prop.getterName;
                shouldProcess = true;
            }
            if (shouldProcess) {
                ret[this.propertyName(meta, propName, platform, ctx)] =
                    this.processProperty(propertyKey, entity, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, parents, ctx);
            }
        }
        return ret;
    }
    static propertyName(meta, prop, platform, ctx) {
        const cacheKey = `${meta.className}:${prop}:${platform?.constructor.name || "none"}`;
        const cached = ctx.propertyNameCache.get(cacheKey);
        if (cached !== undefined)
            return cached;
        const property = meta.properties[prop];
        let result;
        if (property?.serializedName) {
            result = property.serializedName;
        }
        else if (property?.primary && platform) {
            result = platform.getSerializedPrimaryKeyField(prop);
        }
        else {
            result = prop;
        }
        ctx.propertyNameCache.set(cacheKey, result);
        return result;
    }
    static processProperty(prop, entity, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, parents, ctx) {
        const entityConstructorName = entity.constructor.name;
        const newParents = parents.length > 0
            ? [...parents, entityConstructorName]
            : [entityConstructorName];
        const dotIndex = prop.indexOf(DOT);
        if (dotIndex > 0) {
            prop = prop.substring(0, dotIndex);
        }
        const wrapped = (0, core_1.helper)(entity);
        const property = wrapped.__meta.properties[prop];
        const propValue = entity[prop];
        if (typeof propValue === "function") {
            const returnValue = propValue();
            if (!ignoreSerializers && property?.serializer) {
                return property.serializer(returnValue);
            }
            return returnValue;
        }
        if (!ignoreSerializers && property?.serializer) {
            return property.serializer(propValue);
        }
        if (core_1.Utils.isCollection(propValue)) {
            return this.processCollection(prop, entity, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, newParents, ctx);
        }
        if (core_1.Utils.isEntity(propValue, true)) {
            return this.processEntity(prop, entity, wrapped.__platform, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, newParents, ctx);
        }
        if (property?.kind === core_1.ReferenceKind.EMBEDDED) {
            if (Array.isArray(propValue)) {
                const result = new Array(propValue.length);
                for (let i = 0; i < propValue.length; i++) {
                    result[i] = (0, core_1.helper)(propValue[i]).toJSON();
                }
                return result;
            }
            if (core_1.Utils.isObject(propValue)) {
                return (0, core_1.helper)(propValue).toJSON();
            }
        }
        if (property?.customType) {
            return property.customType.toJSON(propValue, wrapped.__platform);
        }
        return wrapped.__platform.normalizePrimaryKey(propValue);
    }
    static extractChildPopulate(populate, prop) {
        if (!Array.isArray(populate) || populate.includes(WILDCARD)) {
            return populate;
        }
        const propPrefix = prop + DOT;
        const propPrefixLength = propPrefix.length;
        const childPopulate = [];
        const populateLength = populate.length;
        for (let i = 0; i < populateLength; i++) {
            const field = populate[i];
            if (field.length > propPrefixLength &&
                field.slice(0, propPrefixLength) === propPrefix) {
                childPopulate.push(field.substring(propPrefixLength));
            }
        }
        return childPopulate.length > 0 ? childPopulate : false;
    }
    static createChildOptions(populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, prop) {
        const childPopulate = this.extractChildPopulate(populate, prop);
        return {
            populate: childPopulate,
            exclude,
            preventCircularRef,
            skipNull,
            ignoreSerializers,
            forceObject,
        };
    }
    static processEntity(prop, entity, platform, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, parents, ctx) {
        const child = core_1.Reference.unwrapReference(entity[prop]);
        const wrapped = (0, core_1.helper)(child);
        const populated = isPopulated(prop, populate) && wrapped.isInitialized();
        const expand = populated || forceObject || !wrapped.__managed;
        if (expand) {
            const childOptions = this.createChildOptions(populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, prop);
            return this.serialize(child, childOptions, parents, ctx);
        }
        return platform.normalizePrimaryKey(wrapped.getPrimaryKey());
    }
    static processCollection(prop, entity, populate, exclude, skipNull, preventCircularRef, ignoreSerializers, forceObject, parents, ctx) {
        const col = entity[prop];
        if (!col.isInitialized())
            return undefined;
        const items = col.getItems(false);
        const itemsLength = items.length;
        if (itemsLength === 0)
            return [];
        const result = new Array(itemsLength);
        let shouldPopulateCollection = false;
        if (populate === true) {
            shouldPopulateCollection = true;
        }
        else if (Array.isArray(populate)) {
            const propLength = prop.length;
            const populateLength = populate.length;
            for (let j = 0; j < populateLength; j++) {
                const item = populate[j];
                if (item === WILDCARD || item === prop) {
                    shouldPopulateCollection = true;
                    break;
                }
                if (item.length > propLength && item[propLength] === DOT) {
                    if (item.slice(0, propLength) === prop) {
                        shouldPopulateCollection = true;
                        break;
                    }
                }
            }
        }
        if (!shouldPopulateCollection) {
            for (let i = 0; i < itemsLength; i++) {
                const item = items[i];
                const wrapped = (0, core_1.helper)(item);
                result[i] = wrapped.getPrimaryKey();
            }
            return result;
        }
        let childPopulate = populate;
        if (Array.isArray(populate) && !populate.includes(WILDCARD)) {
            const propPrefix = prop + DOT;
            const propPrefixLength = propPrefix.length;
            const childPopulateArray = [];
            for (let j = 0; j < populate.length; j++) {
                const field = populate[j];
                if (field.length > propPrefixLength &&
                    field.slice(0, propPrefixLength) === propPrefix) {
                    childPopulateArray.push(field.substring(propPrefixLength));
                }
            }
            childPopulate = childPopulateArray.length > 0 ? childPopulateArray : false;
        }
        const childOptions = {
            populate: childPopulate,
            exclude,
            preventCircularRef,
            skipNull,
            ignoreSerializers,
            forceObject,
        };
        for (let i = 0; i < itemsLength; i++) {
            result[i] = this.serialize(items[i], childOptions, parents, ctx);
        }
        return result;
    }
}
exports.EntitySerializer = EntitySerializer;
const mikroOrmSerializer = (data, options) => {
    const ctx = new RequestScopedSerializationContext();
    const finalOptions = options
        ? {
            populate: Array.isArray(options.populate) &&
                options.populate?.includes(WILDCARD)
                ? true
                : options.populate ?? STATIC_OPTIONS_SHAPE.populate,
            exclude: options.exclude,
            preventCircularRef: options.preventCircularRef ?? STATIC_OPTIONS_SHAPE.preventCircularRef,
            skipNull: options.skipNull ?? STATIC_OPTIONS_SHAPE.skipNull,
            ignoreSerializers: options.ignoreSerializers ?? STATIC_OPTIONS_SHAPE.ignoreSerializers,
            forceObject: options.forceObject ?? STATIC_OPTIONS_SHAPE.forceObject,
        }
        : STATIC_OPTIONS_SHAPE;
    if (!Array.isArray(data)) {
        if (data?.__meta) {
            return EntitySerializer.serialize(data, finalOptions, EMPTY_ARRAY, ctx);
        }
        return data;
    }
    const dataLength = data.length;
    if (dataLength === 0) {
        return [];
    }
    const result = new Array(dataLength);
    for (let i = 0; i < dataLength; i++) {
        const item = data[i];
        if (item?.__meta) {
            result[i] = EntitySerializer.serialize(item, finalOptions, EMPTY_ARRAY, ctx);
        }
        else {
            result[i] = item;
        }
    }
    return result;
};
exports.mikroOrmSerializer = mikroOrmSerializer;
//# sourceMappingURL=mikro-orm-serializer.js.map