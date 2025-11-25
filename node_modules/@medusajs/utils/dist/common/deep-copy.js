"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepCopy = deepCopy;
const is_object_1 = require("./is-object");
const util = __importStar(require("node:util"));
/**
 * In most casees, JSON.parse(JSON.stringify(obj)) is enough to deep copy an object.
 * But in some cases, it's not enough. For example, if the object contains a function or a proxy, it will be lost after JSON.parse(JSON.stringify(obj)).
 *
 * @param obj
 * @param cache
 */
function deepCopy(obj, cache = new WeakMap()) {
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    // Handle circular references with cache
    if (cache.has(obj)) {
        return cache.get(obj);
    }
    let copy;
    // Handle arrays
    if (Array.isArray(obj)) {
        copy = [];
        cache.set(obj, copy) // Add to cache before recursing
        ;
        obj.forEach((item, index) => {
            ;
            copy[index] = deepCopy(item, cache);
        });
        return copy;
    }
    if (util.types.isProxy(obj)) {
        return obj;
    }
    // Handle objects
    if ((0, is_object_1.isObject)(obj)) {
        copy = {};
        cache.set(obj, copy); // Add to cache before recursing
        Object.keys(obj).forEach((key) => {
            ;
            copy[key] = deepCopy(obj[key], cache);
        });
        return copy;
    }
    return obj;
}
//# sourceMappingURL=deep-copy.js.map