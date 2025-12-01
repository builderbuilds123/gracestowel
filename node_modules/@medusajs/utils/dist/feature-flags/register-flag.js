"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeatureFlag = registerFeatureFlag;
const common_1 = require("../common");
/**
 * Registers a feature flag on the provided router.
 * Resolving precedence:
 * - env overrides
 * - project config overrides
 * - default value
 */
function registerFeatureFlag(options) {
    const { flag, projectConfigFlags, router, logger, track } = options;
    let value = (0, common_1.isTruthy)(flag.default_val);
    let from;
    if ((0, common_1.isDefined)(process.env[flag.env_key])) {
        from = "environment";
        const envVal = process.env[flag.env_key];
        value = (0, common_1.isTruthy)(envVal);
        const parsedFromEnv = (0, common_1.isString)(envVal) ? envVal.split(",") : [];
        if (parsedFromEnv.length > 1) {
            value = (0, common_1.objectFromStringPath)(parsedFromEnv);
        }
    }
    else if ((0, common_1.isDefined)(projectConfigFlags[flag.key])) {
        from = "project config";
        const pc = projectConfigFlags[flag.key];
        value = (0, common_1.isTruthy)(pc);
        if ((0, common_1.isObject)(projectConfigFlags[flag.key])) {
            value = projectConfigFlags[flag.key];
        }
    }
    if (logger && from) {
        logger.info(`Using flag ${flag.env_key} from ${from} with value ${JSON.stringify(value)}`);
    }
    if (track && value === true) {
        track(flag.key);
    }
    router.setFlag(flag.key, value);
}
//# sourceMappingURL=register-flag.js.map