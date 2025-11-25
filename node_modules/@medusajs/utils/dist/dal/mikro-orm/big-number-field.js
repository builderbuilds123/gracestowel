"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmBigNumberProperty = MikroOrmBigNumberProperty;
const core_1 = require("@medusajs/deps/mikro-orm/core");
const common_1 = require("../../common");
const big_number_1 = require("../../totals/big-number");
function MikroOrmBigNumberProperty(options = {}) {
    return function (target, columnName) {
        const rawColumnName = options.rawColumnName ?? `raw_${columnName}`;
        Object.defineProperty(target, columnName, {
            get() {
                let value = this.__helper?.__data?.[columnName];
                if (!value && this[rawColumnName]) {
                    value = new big_number_1.BigNumber(this[rawColumnName].value, {
                        precision: this[rawColumnName].precision,
                    }).numeric;
                }
                return value;
            },
            set(value) {
                // convert 'null' to null
                if (value === "null") {
                    value = null;
                }
                if (options?.nullable && !(0, common_1.isPresent)(value)) {
                    this.__helper.__data[columnName] = null;
                    this.__helper.__data[rawColumnName] = null;
                    this[rawColumnName] = null;
                }
                else {
                    // When mikro orm create and hydrate the entity with partial selection it can happen
                    // that null value is being passed.
                    if (!options?.nullable && value === null) {
                        this.__helper.__data[columnName] = undefined;
                        this.__helper.__data[rawColumnName] = undefined;
                        this[rawColumnName] = undefined;
                    }
                    else {
                        let bigNumber;
                        try {
                            if (value instanceof big_number_1.BigNumber) {
                                bigNumber = value;
                            }
                            else if (this[rawColumnName]) {
                                const precision = this[rawColumnName].precision;
                                bigNumber = new big_number_1.BigNumber(value, {
                                    precision,
                                });
                            }
                            else {
                                bigNumber = new big_number_1.BigNumber(value);
                            }
                        }
                        catch (e) {
                            throw new Error(`Cannot set value ${value} for ${columnName}.`);
                        }
                        const raw = bigNumber.raw;
                        raw.value = (0, common_1.trimZeros)(raw.value);
                        // Note: this.__helper isn't present when directly working with the entity
                        // Adding this in optionally for it not to break.
                        if ((0, common_1.isDefined)(this.__helper)) {
                            this.__helper.__data[columnName] = bigNumber.numeric;
                            this.__helper.__data[rawColumnName] = raw;
                        }
                        this[rawColumnName] = raw;
                    }
                }
                // Note: this.__helper isn't present when directly working with the entity
                // Adding this in optionally for it not to break.
                if (!(0, common_1.isDefined)(this.__helper)) {
                    return;
                }
                // This is custom code to keep track of which fields are bignumber, as well as their data
                if (!this.__helper.__bignumberdata) {
                    this.__helper.__bignumberdata = {};
                }
                this.__helper.__bignumberdata[columnName] =
                    this.__helper.__data[columnName];
                this.__helper.__bignumberdata[rawColumnName] =
                    this.__helper.__data[rawColumnName];
                this.__helper.__touched = !this.__helper.hydrator.isRunning();
            },
            enumerable: true,
            configurable: true,
        });
        (0, core_1.Property)({
            type: BigNumberNumeric,
            columnType: "numeric",
            trackChanges: false,
            runtimeType: "any",
            ...options,
        })(target, columnName);
    };
}
class BigNumberNumeric extends core_1.Type {
    constructor(mode) {
        super();
        this.mode = mode;
    }
    convertToJSValue(value) {
        if ((0, common_1.isObject)(value)) {
            return value; // Special case for BigNumberRawValue because the setter will manage the dispatch automatically at a later stage
        }
        if ((this.mode ?? this.prop?.runtimeType) === "number") {
            return +value;
        }
        return String(value);
    }
    compareValues(a, b) {
        return this.format(a) === this.format(b);
    }
    format(val) {
        /* istanbul ignore next */
        if (this.prop?.scale == null) {
            return +val;
        }
        const base = Math.pow(10, this.prop.scale);
        return Math.round((+val + Number.EPSILON) * base) / base;
    }
    getColumnType(prop, platform) {
        return platform.getDecimalTypeDeclarationSQL(prop);
    }
    compareAsType() {
        return this.mode ?? this.prop?.runtimeType ?? "string";
    }
}
//# sourceMappingURL=big-number-field.js.map