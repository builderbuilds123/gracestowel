"use strict";
/**
 * This is an optimized mikro orm serializer to create a highly optimized serialization pipeline
 * that leverages V8's JIT compilation and inline caching mechanisms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mikroOrmSerializer = exports.EntitySerializer = void 0;
const core_1 = require("@mikro-orm/core");
const STATIC_OPTIONS_SHAPE = {
    populate: ["*"],
    exclude: undefined,
    preventCircularRef: true,
    skipNull: undefined,
    ignoreSerializers: undefined,
    forceObject: true,
};
const EMPTY_ARRAY = [];
const WILDCARD = "*";
const DOT = ".";
const UNDERSCORE = "_";
// JIT-friendly function with predictable patterns
function isVisible(meta, propName, options = STATIC_OPTIONS_SHAPE) {
    // Fast path for boolean populate
    const populate = options.populate;
    if (populate === true) {
        return true;
    }
    if (Array.isArray(populate)) {
        // Check exclusions first (early exit)
        const exclude = options.exclude;
        if (exclude && exclude.length > 0) {
            const excludeLen = exclude.length;
            for (let i = 0; i < excludeLen; i++) {
                if (exclude[i] === propName) {
                    return false;
                }
            }
        }
        // Hoist computations outside loop
        const propNameLen = propName.length;
        const propPrefix = propName + DOT;
        const propPrefixLen = propPrefix.length;
        const populateLen = populate.length;
        // Simple loop that JIT can optimize well
        for (let i = 0; i < populateLen; i++) {
            const item = populate[i];
            if (item === propName || item === WILDCARD) {
                return true;
            }
            if (item.length > propNameLen &&
                item.substring(0, propPrefixLen) === propPrefix) {
                return true;
            }
        }
        return false;
    }
    // Inline property check for non-array case
    const prop = meta.properties[propName];
    const visible = (prop && !prop.hidden) || prop === undefined;
    const prefixed = prop && !prop.primary && propName.charAt(0) === UNDERSCORE;
    return visible && !prefixed;
}
// Clean, JIT-friendly function
function isPopulated(entity, propName, options = STATIC_OPTIONS_SHAPE) {
    const populate = options.populate;
    // Fast path for boolean
    if (typeof populate === "boolean") {
        return populate;
    }
    if (!Array.isArray(populate)) {
        return false;
    }
    // Hoist computations for JIT optimization
    const propNameLen = propName.length;
    const propPrefix = propName + DOT;
    const propPrefixLen = propPrefix.length;
    const populateLen = populate.length;
    // Simple predictable loop
    for (let i = 0; i < populateLen; i++) {
        const item = populate[i];
        if (item === propName || item === WILDCARD) {
            return true;
        }
        if (item.length > propNameLen &&
            item.substring(0, propPrefixLen) === propPrefix) {
            return true;
        }
    }
    return false;
}
/**
 * Custom property filtering for the serialization which takes into account circular references to not return them.
 * @param propName
 * @param meta
 * @param options
 * @param parents
 */
// @ts-ignore
function filterEntityPropToSerialize({ propName, meta, options, parents, }) {
    const parentsArray = parents || EMPTY_ARRAY;
    const isVisibleRes = isVisible(meta, propName, options);
    const prop = meta.properties[propName];
    if (prop &&
        options.preventCircularRef &&
        isVisibleRes &&
        prop.kind !== core_1.ReferenceKind.SCALAR) {
        if (!!prop.mapToPk) {
            return true;
        }
        const parentsLen = parentsArray.length;
        for (let i = 0; i < parentsLen; i++) {
            if (parentsArray[i] === prop.type) {
                return false;
            }
        }
        return true;
    }
    return isVisibleRes;
}
class EntitySerializer {
    static serialize(entity, options = STATIC_OPTIONS_SHAPE, parents = EMPTY_ARRAY) {
        // Avoid Array.from and Set allocation for hot path
        const parents_ = parents.length > 0 ? Array.from(new Set(parents)) : [];
        const wrapped = (0, core_1.helper)(entity);
        const meta = wrapped.__meta;
        let contextCreated = false;
        if (!wrapped.__serializationContext.root) {
            const root = new core_1.SerializationContext({});
            core_1.SerializationContext.propagate(root, entity, (meta, prop) => meta.properties[prop]?.kind !== core_1.ReferenceKind.SCALAR);
            contextCreated = true;
        }
        const root = wrapped.__serializationContext
            .root;
        const ret = {};
        // Use Set for deduplication but keep it simple
        const keys = new Set();
        const primaryKeys = meta.primaryKeys;
        const primaryKeysLen = primaryKeys.length;
        for (let i = 0; i < primaryKeysLen; i++) {
            keys.add(primaryKeys[i]);
        }
        const entityKeys = Object.keys(entity);
        const entityKeysLen = entityKeys.length;
        for (let i = 0; i < entityKeysLen; i++) {
            keys.add(entityKeys[i]);
        }
        const visited = root.visited.has(entity);
        if (!visited) {
            root.visited.add(entity);
        }
        const keysArray = Array.from(keys);
        const keysLen = keysArray.length;
        // Hoist invariant calculations
        const className = meta.className;
        const platform = wrapped.__platform;
        const skipNull = options.skipNull;
        const metaProperties = meta.properties;
        const preventCircularRef = options.preventCircularRef;
        // Clean property processing loop
        for (let i = 0; i < keysLen; i++) {
            const prop = keysArray[i];
            // Simple filtering logic
            const isVisibleRes = isVisible(meta, prop, options);
            const propMeta = metaProperties[prop];
            let shouldSerialize = isVisibleRes;
            if (propMeta &&
                preventCircularRef &&
                isVisibleRes &&
                propMeta.kind !== core_1.ReferenceKind.SCALAR) {
                if (!!propMeta.mapToPk) {
                    shouldSerialize = true;
                }
                else {
                    const parentsLen = parents_.length;
                    for (let j = 0; j < parentsLen; j++) {
                        if (parents_[j] === propMeta.type) {
                            shouldSerialize = false;
                            break;
                        }
                    }
                }
            }
            if (!shouldSerialize) {
                continue;
            }
            const cycle = root.visit(className, prop);
            if (cycle && visited)
                continue;
            const val = this.processProperty(prop, entity, options, parents_);
            if (!cycle) {
                root.leave(className, prop);
            }
            if (skipNull && core_1.Utils.isPlainObject(val)) {
                core_1.Utils.dropUndefinedProperties(val, null);
            }
            if (typeof val !== "undefined" && !(val === null && skipNull)) {
                ret[this.propertyName(meta, prop, platform)] =
                    val;
            }
        }
        if (contextCreated) {
            root.close();
        }
        if (!wrapped.isInitialized()) {
            return ret;
        }
        // Clean getter processing
        const metaProps = meta.props;
        const metaPropsLen = metaProps.length;
        for (let i = 0; i < metaPropsLen; i++) {
            const prop = metaProps[i];
            const propName = prop.name;
            // Clear, readable conditions
            if (prop.getter &&
                prop.getterName === undefined &&
                typeof entity[propName] !== "undefined" &&
                isVisible(meta, propName, options)) {
                ret[this.propertyName(meta, propName, platform)] = this.processProperty(propName, entity, options, parents_);
            }
            else if (prop.getterName &&
                entity[prop.getterName] instanceof Function &&
                isVisible(meta, propName, options)) {
                ret[this.propertyName(meta, propName, platform)] = this.processProperty(prop.getterName, entity, options, parents_);
            }
        }
        return ret;
    }
    static propertyName(meta, prop, platform) {
        // Use WeakMap per metadata to avoid global cache conflicts
        let entityCache = this.propertyNameCache.get(meta);
        if (!entityCache) {
            entityCache = new Map();
            this.propertyNameCache.set(meta, entityCache);
        }
        const cacheKey = `${prop}:${platform?.constructor.name || "no-platform"}`;
        const cached = entityCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        // Inline property resolution for hot path
        let result;
        const property = meta.properties[prop];
        /* istanbul ignore next */
        if (property?.serializedName) {
            result = property.serializedName;
        }
        else if (property?.primary && platform) {
            result = platform.getSerializedPrimaryKeyField(prop);
        }
        else {
            result = prop;
        }
        // Prevent cache from growing too large
        if (entityCache.size >= this.PROPERTY_CACHE_SIZE) {
            entityCache.clear(); // Much faster than selective deletion
        }
        entityCache.set(cacheKey, result);
        return result;
    }
    static processProperty(prop, entity, options, parents = EMPTY_ARRAY) {
        // Avoid array allocation when not needed
        const parents_ = parents.length > 0
            ? [...parents, entity.constructor.name]
            : [entity.constructor.name];
        // Handle dotted properties efficiently
        const parts = prop.split(DOT);
        prop = parts[0];
        const wrapped = (0, core_1.helper)(entity);
        const property = wrapped.__meta.properties[prop];
        const serializer = property?.serializer;
        const propValue = entity[prop];
        // Fast path for function properties
        if (propValue instanceof Function) {
            const returnValue = propValue();
            if (!options.ignoreSerializers && serializer) {
                return serializer(returnValue);
            }
            return returnValue;
        }
        /* istanbul ignore next */
        if (!options.ignoreSerializers && serializer) {
            return serializer(propValue);
        }
        // Type checks in optimal order
        if (core_1.Utils.isCollection(propValue)) {
            return this.processCollection(prop, entity, options, parents_);
        }
        if (core_1.Utils.isEntity(propValue, true)) {
            return this.processEntity(prop, entity, wrapped.__platform, options, parents_);
        }
        /* istanbul ignore next */
        if (property?.reference === core_1.ReferenceKind.EMBEDDED) {
            if (Array.isArray(propValue)) {
                return propValue.map((item) => (0, core_1.helper)(item).toJSON());
            }
            if (core_1.Utils.isObject(propValue)) {
                return (0, core_1.helper)(propValue).toJSON();
            }
        }
        const customType = property?.customType;
        if (customType) {
            return customType.toJSON(propValue, wrapped.__platform);
        }
        return wrapped.__platform.normalizePrimaryKey(propValue);
    }
    static extractChildOptions(options, prop) {
        const propPrefix = prop + DOT;
        const propPrefixLen = propPrefix.length;
        // Inline function to avoid call overhead
        const extractChildElements = (items) => {
            const result = [];
            const itemsLen = items.length;
            // Traditional for loop for better performance
            for (let i = 0; i < itemsLen; i++) {
                const field = items[i];
                if (field.length > propPrefixLen &&
                    field.substring(0, propPrefixLen) === propPrefix) {
                    result.push(field.substring(propPrefixLen));
                }
            }
            return result;
        };
        const populate = options.populate;
        const exclude = options.exclude;
        // Avoid object spread when possible
        const result = {
            populate: Array.isArray(populate) && !populate.includes(WILDCARD)
                ? extractChildElements(populate)
                : populate,
            exclude: Array.isArray(exclude) && !exclude.includes(WILDCARD)
                ? extractChildElements(exclude)
                : exclude,
            preventCircularRef: options.preventCircularRef,
            skipNull: options.skipNull,
            ignoreSerializers: options.ignoreSerializers,
            forceObject: options.forceObject,
        };
        return result;
    }
    static processEntity(prop, entity, platform, options, parents = EMPTY_ARRAY) {
        const parents_ = parents.length > 0
            ? [...parents, entity.constructor.name]
            : [entity.constructor.name];
        const child = core_1.Reference.unwrapReference(entity[prop]);
        const wrapped = (0, core_1.helper)(child);
        // Fixed: was incorrectly calling isPopulated(child, prop, options) instead of isPopulated(entity, prop, options)
        const populated = isPopulated(entity, prop, options) && wrapped.isInitialized();
        const expand = populated || options.forceObject || !wrapped.__managed;
        if (expand) {
            return this.serialize(child, this.extractChildOptions(options, prop), parents_);
        }
        return platform.normalizePrimaryKey(wrapped.getPrimaryKey());
    }
    static processCollection(prop, entity, options, parents = EMPTY_ARRAY) {
        const parents_ = parents.length > 0
            ? [...parents, entity.constructor.name]
            : [entity.constructor.name];
        const col = entity[prop];
        if (!col.isInitialized()) {
            return undefined;
        }
        const items = col.getItems(false);
        const itemsLen = items.length;
        const result = new Array(itemsLen);
        const childOptions = this.extractChildOptions(options, prop);
        // Check if the collection property itself should be populated
        // Fixed: was incorrectly calling isPopulated(item, prop, options) instead of isPopulated(entity, prop, options)
        const shouldPopulateCollection = isPopulated(entity, prop, options);
        for (let i = 0; i < itemsLen; i++) {
            const item = items[i];
            if (shouldPopulateCollection) {
                result[i] = this.serialize(item, childOptions, parents_);
            }
            else {
                result[i] = (0, core_1.helper)(item).getPrimaryKey();
            }
        }
        return result;
    }
}
exports.EntitySerializer = EntitySerializer;
// Thread-safe per-instance cache to avoid concurrency issues
EntitySerializer.PROPERTY_CACHE_SIZE = 2000;
// Thread-safe property name resolution with WeakMap for per-entity caching
EntitySerializer.propertyNameCache = new WeakMap();
const mikroOrmSerializer = (data, options) => {
    return new Promise((resolve) => {
        // Efficient options handling
        if (!options) {
            options = STATIC_OPTIONS_SHAPE;
        }
        else {
            // Check if we can use static shape
            let useStatic = true;
            const optionKeys = Object.keys(options);
            for (let i = 0; i < optionKeys.length; i++) {
                const key = optionKeys[i];
                if (options[key] !==
                    STATIC_OPTIONS_SHAPE[key]) {
                    useStatic = false;
                    break;
                }
            }
            if (useStatic) {
                options = STATIC_OPTIONS_SHAPE;
            }
            else {
                options = { ...STATIC_OPTIONS_SHAPE, ...options };
            }
        }
        const data_ = (Array.isArray(data) ? data : [data]).filter(Boolean);
        const forSerialization = [];
        const notForSerialization = [];
        // Simple classification loop
        const dataLen = data_.length;
        for (let i = 0; i < dataLen; i++) {
            const object = data_[i];
            if (object.__meta) {
                forSerialization.push(object);
            }
            else {
                notForSerialization.push(object);
            }
        }
        // Pre-allocate result array
        const forSerializationLen = forSerialization.length;
        const result = new Array(forSerializationLen);
        for (let i = 0; i < forSerializationLen; i++) {
            result[i] = EntitySerializer.serialize(forSerialization[i], options);
        }
        // Simple result construction
        let finalResult;
        if (notForSerialization.length > 0) {
            finalResult = result.concat(notForSerialization);
        }
        else {
            finalResult = result;
        }
        resolve(Array.isArray(data) ? finalResult : finalResult[0]);
    });
};
exports.mikroOrmSerializer = mikroOrmSerializer;
//# sourceMappingURL=mikro-orm-serializer-old.js.map