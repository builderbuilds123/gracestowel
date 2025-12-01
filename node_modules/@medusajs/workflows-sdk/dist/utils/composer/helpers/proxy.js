"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxify = proxify;
const transform_1 = require("../transform");
function proxify(obj) {
    return new Proxy(obj, {
        get(target, prop) {
            if (prop in target) {
                return target[prop];
            }
            const transformer = (0, transform_1.transform)({ target }, function (data) {
                return data.target?.[prop];
            });
            return transformer;
        },
    });
}
//# sourceMappingURL=proxy.js.map