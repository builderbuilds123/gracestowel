"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCSVValue = normalizeCSVValue;
/**
 * Normalizes a CSV value by removing the leading "\r" from the
 * value.
 */
function normalizeCSVValue(value) {
    if (typeof value === "string") {
        return value.replace(/\\r$/, "").trim();
    }
    return value;
}
//# sourceMappingURL=normalize-csv-value.js.map