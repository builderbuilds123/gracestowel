"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBigNumberProperties = createBigNumberProperties;
const is_big_number_1 = require("../../../common/is-big-number");
const is_defined_1 = require("../../../common/is-defined");
const trim_zeros_1 = require("../../../common/trim-zeros");
const big_number_1 = require("../../../totals/big-number");
const big_number_2 = require("../../properties/big-number");
const json_1 = require("../../properties/json");
const nullable_1 = require("../../properties/nullable");
function createBigNumberProperties(schema) {
    const schemaWithBigNumber = {};
    for (const [key, property] of Object.entries(schema)) {
        if (big_number_2.BigNumberProperty.isBigNumberProperty(property) ||
            nullable_1.NullableModifier.isNullableModifier(property)) {
            const parsed = property.parse(key);
            if (parsed.dataType?.name !== "bigNumber") {
                continue;
            }
            let defaultValue = parsed.defaultValue;
            if ((0, is_defined_1.isDefined)(defaultValue)) {
                const bigNumber = (0, is_big_number_1.isBigNumber)(defaultValue)
                    ? defaultValue
                    : new big_number_1.BigNumber(defaultValue);
                bigNumber.raw.value = (0, trim_zeros_1.trimZeros)(bigNumber.raw.value + "");
                defaultValue = bigNumber.raw;
            }
            let jsonProperty = parsed.nullable
                ? new json_1.JSONProperty().default(defaultValue).nullable()
                : new json_1.JSONProperty().default(defaultValue);
            if (parsed.computed) {
                jsonProperty = jsonProperty.computed();
            }
            schemaWithBigNumber[`raw_${key}`] = jsonProperty;
        }
    }
    return schemaWithBigNumber;
}
//# sourceMappingURL=create-big-number-properties.js.map