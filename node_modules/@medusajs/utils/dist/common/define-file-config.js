"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDUSA_SKIP_FILE = void 0;
exports.defineFileConfig = defineFileConfig;
exports.getDefinedFileConfig = getDefinedFileConfig;
exports.isFileDisabled = isFileDisabled;
exports.isFileSkipped = isFileSkipped;
const get_caller_file_path_1 = require("./get-caller-file-path");
exports.MEDUSA_SKIP_FILE = Symbol.for("__MEDUSA_SKIP_FILE__");
/**
 * The "defineFileConfig" helper can be used to define the configuration
 * of any file auto-loaded by Medusa.
 *
 * It is used to avoid loading files that are not required. Like a feature flag
 * that is disabled.
 */
const FILE_CONFIGS = new Map();
function defineFileConfig(config) {
    const filePath = config?.path ?? (0, get_caller_file_path_1.getCallerFilePath)();
    FILE_CONFIGS.set(filePath, config);
}
function getDefinedFileConfig(path) {
    return FILE_CONFIGS.get(path);
}
function isFileDisabled(path) {
    return !!getDefinedFileConfig(path)?.isDisabled?.();
}
function isFileSkipped(exported) {
    return !!exported?.[exports.MEDUSA_SKIP_FILE];
}
//# sourceMappingURL=define-file-config.js.map