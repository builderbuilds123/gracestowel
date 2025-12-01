"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _CSVNormalizer_instances, _CSVNormalizer_rows, _CSVNormalizer_products, _CSVNormalizer_getOrInitializeProductById, _CSVNormalizer_getOrInitializeProductByHandle, _CSVNormalizer_processRow;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSVNormalizer = void 0;
const common_1 = require("../common");
/**
 * Creates an error with the CSV row number
 */
function createError(rowNumber, message) {
    return new common_1.MedusaError(common_1.MedusaError.Types.INVALID_DATA, `Row ${rowNumber}: ${message}`);
}
/**
 * Parses different patterns to extract variant price iso
 * and the region name. The iso is converted to lowercase
 */
function parseVariantPriceColumn(columnName, rowNumber) {
    const normalizedValue = columnName;
    const potentialRegion = /\[(.*)\]/g.exec(normalizedValue)?.[1];
    const iso = normalizedValue.split(" ").pop();
    if (!iso) {
        throw createError(rowNumber, `Invalid price format used by "${columnName}". Expect column name to contain the ISO code as the last segment. For example: "Variant Price [Europe] EUR" or "Variant Price EUR"`);
    }
    return {
        iso: iso.toLowerCase(),
        region: potentialRegion,
    };
}
/**
 * Processes a column value as a string
 */
function processAsString(inputKey, outputKey) {
    return (csvRow, _, __, output) => {
        const value = csvRow[inputKey];
        if ((0, common_1.isPresent)(value)) {
            output[outputKey] = value;
        }
    };
}
/**
 * Process a column value as a json object
 */
function processAsJson(inputKey, outputKey) {
    return (csvRow, _, rowNumber, output) => {
        const value = csvRow[inputKey];
        if ((0, common_1.isPresent)(value)) {
            if (typeof value === "string") {
                try {
                    output[outputKey] = JSON.parse(value);
                }
                catch (error) {
                    throw createError(rowNumber, `Invalid value provided for "${inputKey}". Expected a valid JSON string, received "${value}"`);
                }
            }
        }
        return undefined;
    };
}
/**
 * Processes a column value but ignores it (no-op processor for system-generated fields)
 */
function processAsIgnored() {
    return () => {
        // Do nothing - this column is intentionally ignored
    };
}
/**
 * Processes the column value as a boolean
 */
function processAsBoolean(inputKey, outputKey) {
    return (csvRow, _, __, output) => {
        const value = csvRow[inputKey];
        if ((0, common_1.isPresent)(value)) {
            output[outputKey] = (0, common_1.tryConvertToBoolean)(value, value);
        }
    };
}
/**
 * Processes the column value as a number
 */
function processAsNumber(inputKey, outputKey, options) {
    return (csvRow, _, rowNumber, output) => {
        const value = csvRow[inputKey];
        if ((0, common_1.isPresent)(value)) {
            const numericValue = (0, common_1.tryConvertToNumber)(value);
            if (numericValue === undefined) {
                throw createError(rowNumber, `Invalid value provided for "${inputKey}". Expected value to be a number, received "${value}"`);
            }
            else {
                if (options?.asNumericString) {
                    output[outputKey] = String(numericValue);
                }
                else {
                    output[outputKey] = numericValue;
                }
            }
        }
    };
}
/**
 * Processes the CSV column as a counter value. The counter values
 * are defined as "<Column Name> <1>". Duplicate values are not
 * added twice.
 */
function processAsCounterValue(inputMatcher, arrayItemKey, outputKey) {
    return (csvRow, rowColumns, _, output) => {
        const matchingColumns = rowColumns.filter((rowKey) => inputMatcher.test(rowKey));
        // Only initialize the array if there are matching columns in the CSV
        if (matchingColumns.length > 0) {
            output[outputKey] = output[outputKey] ?? [];
            const existingIds = output[outputKey].map((item) => item[arrayItemKey]);
            matchingColumns.forEach((rowKey) => {
                const value = csvRow[rowKey];
                if (!existingIds.includes(value) && (0, common_1.isPresent)(value)) {
                    output[outputKey].push({ [arrayItemKey]: value });
                }
            });
        }
    };
}
/**
 * Collection of static product columns whose values must be copied
 * as it is without any further processing.
 */
const productStaticColumns = {
    "product id": processAsString("product id", "id"),
    "product handle": processAsString("product handle", "handle"),
    "product title": processAsString("product title", "title"),
    "product subtitle": processAsString("product subtitle", "subtitle"),
    "product status": processAsString("product status", "status"),
    "product description": processAsString("product description", "description"),
    "product external id": processAsString("product external id", "external_id"),
    "product thumbnail": processAsString("product thumbnail", "thumbnail"),
    "product collection id": processAsString("product collection id", "collection_id"),
    "product type id": processAsString("product type id", "type_id"),
    "product discountable": processAsBoolean("product discountable", "discountable"),
    "product height": processAsNumber("product height", "height"),
    "product hs code": processAsString("product hs code", "hs_code"),
    "product length": processAsNumber("product length", "length"),
    "product material": processAsString("product material", "material"),
    "product mid code": processAsString("product mid code", "mid_code"),
    "product origin country": processAsString("product origin country", "origin_country"),
    "product weight": processAsNumber("product weight", "weight"),
    "product width": processAsNumber("product width", "width"),
    "product metadata": processAsJson("product metadata", "metadata"),
    "shipping profile id": processAsString("shipping profile id", "shipping_profile_id"),
    // Product properties that should be imported
    "product is giftcard": processAsBoolean("product is giftcard", "is_giftcard"),
    // System-generated timestamp fields that should be ignored during import
    "product created at": processAsIgnored(),
    "product deleted at": processAsIgnored(),
    "product updated at": processAsIgnored(),
};
/**
 * Collection of wildcard product columns whose values will be computed by
 * one or more columns from the CSV row.
 */
const productWildcardColumns = {
    "product category": processAsCounterValue(/product category \d/, "id", "categories"),
    "product image": processAsCounterValue(/product image \d/, "url", "images"),
    "product tag": processAsCounterValue(/product tag \d/, "id", "tags"),
    "product sales channel": processAsCounterValue(/product sales channel \d/, "id", "sales_channels"),
};
/**
 * Collection of static variant columns whose values must be copied
 * as it is without any further processing.
 */
const variantStaticColumns = {
    "variant id": processAsString("variant id", "id"),
    "variant title": processAsString("variant title", "title"),
    "variant sku": processAsString("variant sku", "sku"),
    "variant upc": processAsString("variant upc", "upc"),
    "variant ean": processAsString("variant ean", "ean"),
    "variant hs code": processAsString("variant hs code", "hs_code"),
    "variant mid code": processAsString("variant mid code", "mid_code"),
    "variant manage inventory": processAsBoolean("variant manage inventory", "manage_inventory"),
    "variant allow backorder": processAsBoolean("variant allow backorder", "allow_backorder"),
    "variant barcode": processAsString("variant barcode", "barcode"),
    "variant height": processAsNumber("variant height", "height"),
    "variant length": processAsNumber("variant length", "length"),
    "variant material": processAsString("variant material", "material"),
    "variant metadata": processAsJson("variant metadata", "metadata"),
    "variant origin country": processAsString("variant origin country", "origin_country"),
    "variant variant rank": processAsNumber("variant variant rank", "variant_rank"),
    "variant width": processAsNumber("variant width", "width"),
    "variant weight": processAsNumber("variant weight", "weight"),
    // System-generated timestamp fields that should be ignored during import
    "variant created at": processAsIgnored(),
    "variant deleted at": processAsIgnored(),
    "variant updated at": processAsIgnored(),
    // This field should be ignored as it's redundant (variant already belongs to product)
    "variant product id": processAsIgnored(),
};
/**
 * Collection of wildcard variant columns whose values will be computed by
 * one or more columns from the CSV row.
 */
const variantWildcardColumns = {
    "variant price": (csvRow, rowColumns, rowNumber, output) => {
        const pricesColumns = rowColumns.filter((rowKey) => {
            return rowKey.startsWith("variant price ") && (0, common_1.isPresent)(csvRow[rowKey]);
        });
        output["prices"] = output["prices"] ?? [];
        pricesColumns.forEach((columnName) => {
            const { iso } = parseVariantPriceColumn(columnName, rowNumber);
            const value = csvRow[columnName];
            const numericValue = (0, common_1.tryConvertToNumber)(value);
            if (numericValue === undefined) {
                throw createError(rowNumber, `Invalid value provided for "${columnName}". Expected value to be a number, received "${value}"`);
            }
            else {
                output["prices"].push({
                    currency_code: iso,
                    amount: numericValue,
                });
            }
        });
    },
};
/**
 * Options are processed separately and then defined on both the products and
 * the variants.
 */
const optionColumns = {
    "variant option": (csvRow, rowColumns, rowNumber, output) => {
        const matcher = /variant option \d+ name/;
        const optionNameColumns = rowColumns.filter((rowKey) => {
            return matcher.test(rowKey) && (0, common_1.isPresent)(csvRow[rowKey]);
        });
        output["options"] = optionNameColumns.map((columnName) => {
            const [, , counter] = columnName.split(" ");
            const key = csvRow[columnName];
            const value = csvRow[`variant option ${counter} value`];
            if (!(0, common_1.isPresent)(value)) {
                throw createError(rowNumber, `Missing option value for "${columnName}"`);
            }
            return {
                key,
                value,
            };
        });
    },
};
/**
 * An array of known columns
 */
const knownStaticColumns = Object.keys(productStaticColumns).concat(Object.keys(variantStaticColumns));
const knownWildcardColumns = Object.keys(productWildcardColumns)
    .concat(Object.keys(variantWildcardColumns))
    .concat(Object.keys(optionColumns));
/**
 * CSV normalizer processes all the allowed columns from a CSV file and remaps
 * them into a new object with properties matching the "AdminCreateProduct".
 *
 * However, further validations must be performed to validate the format and
 * the required fields in the normalized output.
 */
class CSVNormalizer {
    /**
     * Normalizes a row by converting all keys to lowercase and removing
     * the leading "\r" from the keys and the values.
     *
     * Also, it values the row to contain unknown columns and must contain
     * the "product id" or "product handle" columns.
     */
    static preProcess(row, rowNumber) {
        const unknownColumns = [];
        const normalized = Object.keys(row).reduce((result, key) => {
            const lowerCaseKey = (0, common_1.normalizeCSVValue)(key).toLowerCase();
            if (!knownStaticColumns.includes(lowerCaseKey) &&
                !knownWildcardColumns.some((column) => lowerCaseKey.startsWith(column))) {
                unknownColumns.push(key);
            }
            result[lowerCaseKey] = (0, common_1.normalizeCSVValue)(row[key]);
            return result;
        }, {});
        if (unknownColumns.length) {
            throw new common_1.MedusaError(common_1.MedusaError.Types.INVALID_DATA, `Invalid column name(s) "${unknownColumns.join('","')}"`);
        }
        const productId = normalized["product id"];
        const productHandle = normalized["product handle"];
        if (!(0, common_1.isPresent)(productId) && !(0, common_1.isPresent)(productHandle)) {
            throw createError(rowNumber, "Missing product id and handle. One of these columns are required to process the row");
        }
        return normalized;
    }
    constructor(rows) {
        _CSVNormalizer_instances.add(this);
        _CSVNormalizer_rows.set(this, void 0);
        _CSVNormalizer_products.set(this, {
            toCreate: {},
            toUpdate: {},
        });
        __classPrivateFieldSet(this, _CSVNormalizer_rows, rows, "f");
    }
    /**
     * Process CSV rows. The return value is a tree of products
     */
    proccess(resumingFromIndex = 0) {
        __classPrivateFieldGet(this, _CSVNormalizer_rows, "f").forEach((row, index) => __classPrivateFieldGet(this, _CSVNormalizer_instances, "m", _CSVNormalizer_processRow).call(this, row, resumingFromIndex + index + 1));
        __classPrivateFieldSet(this, _CSVNormalizer_rows, [], "f");
        return __classPrivateFieldGet(this, _CSVNormalizer_products, "f");
    }
}
exports.CSVNormalizer = CSVNormalizer;
_CSVNormalizer_rows = new WeakMap(), _CSVNormalizer_products = new WeakMap(), _CSVNormalizer_instances = new WeakSet(), _CSVNormalizer_getOrInitializeProductById = function _CSVNormalizer_getOrInitializeProductById(id) {
    if (!__classPrivateFieldGet(this, _CSVNormalizer_products, "f").toUpdate[id]) {
        __classPrivateFieldGet(this, _CSVNormalizer_products, "f").toUpdate[id] = {};
    }
    return __classPrivateFieldGet(this, _CSVNormalizer_products, "f").toUpdate[id];
}, _CSVNormalizer_getOrInitializeProductByHandle = function _CSVNormalizer_getOrInitializeProductByHandle(handle) {
    if (!__classPrivateFieldGet(this, _CSVNormalizer_products, "f").toCreate[handle]) {
        __classPrivateFieldGet(this, _CSVNormalizer_products, "f").toCreate[handle] = {};
    }
    return __classPrivateFieldGet(this, _CSVNormalizer_products, "f").toCreate[handle];
}, _CSVNormalizer_processRow = function _CSVNormalizer_processRow(row, rowNumber) {
    const rowColumns = Object.keys(row);
    const productId = row["product id"];
    const productHandle = row["product handle"];
    /**
     * Create representation of a product by its id or handle and process
     * its static + wildcard columns
     */
    const product = productId
        ? __classPrivateFieldGet(this, _CSVNormalizer_instances, "m", _CSVNormalizer_getOrInitializeProductById).call(this, String(productId))
        : __classPrivateFieldGet(this, _CSVNormalizer_instances, "m", _CSVNormalizer_getOrInitializeProductByHandle).call(this, String(productHandle));
    Object.keys(productStaticColumns).forEach((column) => {
        productStaticColumns[column](row, rowColumns, rowNumber, product);
    });
    Object.keys(productWildcardColumns).forEach((column) => {
        productWildcardColumns[column](row, rowColumns, rowNumber, product);
    });
    /**
     * Create representation of a variant and process
     * its static + wildcard columns
     */
    const variant = {};
    Object.keys(variantStaticColumns).forEach((column) => {
        variantStaticColumns[column](row, rowColumns, rowNumber, variant);
    });
    Object.keys(variantWildcardColumns).forEach((column) => {
        variantWildcardColumns[column](row, rowColumns, rowNumber, variant);
    });
    /**
     * Process variant options as a standalone array
     */
    const options = { options: [] };
    Object.keys(optionColumns).forEach((column) => {
        optionColumns[column](row, rowColumns, rowNumber, options);
    });
    /**
     * Specify options on both the variant and the product
     */
    options.options.forEach(({ key, value }) => {
        variant.options = variant.options ?? {};
        variant.options[key] = value;
        product.options = product.options ?? [];
        const matchingKey = product.options.find((option) => option.title === key);
        if (!matchingKey) {
            product.options.push({ title: key, values: [value] });
        }
        else if (!matchingKey.values.includes(value)) {
            matchingKey.values.push(value);
        }
    });
    /**
     * Assign variant to the product
     */
    product.variants = product.variants ?? [];
    product.variants.push(variant);
};
//# sourceMappingURL=csv-normalizer.js.map