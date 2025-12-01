"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCache = useCache;
exports.Cached = Cached;
const modules_sdk_1 = require("../modules-sdk");
const feature_flags_1 = require("../feature-flags");
const common_1 = require("../common");
/**
 * This function is used to cache the result of a function call.
 *
 * @param cb - The callback to execute.
 * @param options - The options for the cache.
 * @returns The result of the callback.
 */
async function useCache(cb, options) {
    const cachingModule = options.container.resolve(modules_sdk_1.Modules.CACHING, {
        allowUnregistered: true,
    });
    if (!options.enable ||
        !feature_flags_1.FeatureFlag.isFeatureEnabled("caching") ||
        !cachingModule) {
        return await cb();
    }
    let key;
    if (typeof options.key === "string") {
        key = options.key;
    }
    else {
        key = await cachingModule.computeKey(options.key);
    }
    const data = await cachingModule.get({
        key,
        tags: options.tags,
        providers: options.providers,
    });
    if (data) {
        return data;
    }
    const result = await cb();
    void cachingModule
        .set({
        key,
        tags: options.tags,
        ttl: options.ttl,
        data: result,
        options: { autoInvalidate: options.autoInvalidate },
        providers: options.providers,
    })
        .catch((e) => {
        const logger = options.container.resolve(common_1.ContainerRegistrationKeys.LOGGER, {
            allowUnregistered: true,
        }) ?? console;
        logger.error(`An error occured while setting cache for key: ${key}\n${e.message}\n${e.stack}`);
    });
    return result;
}
/**
 * This function is used to cache the result of a method call.
 *
 * @param options - The options for the cache.
 * @returns The original method with the cache applied.
 */
function Cached(options) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        if (typeof originalMethod !== "function") {
            throw new Error("@cached can only be applied to methods");
        }
        descriptor.value = async function (...args) {
            const container = typeof options.container === "function"
                ? options.container.call(this)
                : options.container;
            const cachingModule = container.resolve(modules_sdk_1.Modules.CACHING, {
                allowUnregistered: true,
            });
            if (!feature_flags_1.FeatureFlag.isFeatureEnabled("caching") || !cachingModule) {
                return await originalMethod.apply(this, args);
            }
            if (!options.key) {
                options.key = await cachingModule.computeKey(args
                    .map((arg) => {
                    if ((0, common_1.isObject)(arg)) {
                        // Prevent any container, manager, transactionManager, etc from being included in the key
                        const { container, manager, transactionManager, __type, ...rest } = arg;
                        if (__type === modules_sdk_1.MedusaContextType) {
                            return;
                        }
                        return rest;
                    }
                    return arg;
                })
                    .filter(Boolean));
            }
            const resolvableKeys = [
                "enable",
                "key",
                "tags",
                "ttl",
                "autoInvalidate",
                "providers",
            ];
            const cacheOptions = {};
            const promises = [];
            for (const key of resolvableKeys) {
                if (typeof options[key] === "function") {
                    const res = options[key](args, cachingModule);
                    if (res instanceof Promise) {
                        promises.push(res.then((value) => {
                            cacheOptions[key] = value;
                        }));
                    }
                    else {
                        cacheOptions[key] = res;
                    }
                }
                else {
                    cacheOptions[key] = options[key];
                }
            }
            await Promise.all(promises);
            if (!cacheOptions.enable) {
                return await originalMethod.apply(this, args);
            }
            Object.assign(cacheOptions, {
                container,
            });
            return await useCache(() => originalMethod.apply(this, args), cacheOptions);
        };
        return descriptor;
    };
}
//# sourceMappingURL=index.js.map