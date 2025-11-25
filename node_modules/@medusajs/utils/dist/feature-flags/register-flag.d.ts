import { FlagSettings, Logger } from "@medusajs/types";
import { FlagRouter } from "./flag-router";
export type RegisterFeatureFlagOptions = {
    flag: FlagSettings;
    projectConfigFlags: Record<string, string | boolean | Record<string, boolean>>;
    router: FlagRouter;
    logger?: Logger;
    track?: (key: string) => void;
};
/**
 * Registers a feature flag on the provided router.
 * Resolving precedence:
 * - env overrides
 * - project config overrides
 * - default value
 */
export declare function registerFeatureFlag(options: RegisterFeatureFlagOptions): void;
//# sourceMappingURL=register-flag.d.ts.map