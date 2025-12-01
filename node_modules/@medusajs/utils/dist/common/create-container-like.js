"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContainerLike = createContainerLike;
function createContainerLike(obj) {
    return {
        resolve(key, { allowUnregistered = false, } = {}) {
            if (allowUnregistered) {
                try {
                    return obj[key];
                }
                catch (error) {
                    return undefined;
                }
            }
            return obj[key];
        },
    };
}
//# sourceMappingURL=create-container-like.js.map