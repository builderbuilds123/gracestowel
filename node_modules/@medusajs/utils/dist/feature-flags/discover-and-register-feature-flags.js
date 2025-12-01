"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverAndRegisterFeatureFlags = discoverAndRegisterFeatureFlags;
const discover_feature_flags_1 = require("./discover-feature-flags");
const register_flag_1 = require("./register-flag");
/**
 * Utility function to discover and register feature flags from a directory
 */
async function discoverAndRegisterFeatureFlags(options) {
    const { flagDir, projectConfigFlags = {}, router, logger, track, maxDepth, } = options;
    const discovered = await (0, discover_feature_flags_1.discoverFeatureFlagsFromDir)(flagDir, maxDepth);
    for (const def of discovered) {
        const registerOptions = {
            flag: def,
            projectConfigFlags,
            router,
            logger,
            track,
        };
        (0, register_flag_1.registerFeatureFlag)(registerOptions);
    }
}
//# sourceMappingURL=discover-and-register-feature-flags.js.map