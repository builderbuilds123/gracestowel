import { Logger } from "@medusajs/types";
import { FlagRouter } from "./flag-router";
export interface DiscoverAndRegisterOptions {
    flagDir: string;
    projectConfigFlags?: Record<string, any>;
    router: FlagRouter;
    logger?: Logger;
    track?: (key: string) => void;
    maxDepth?: number;
}
/**
 * Utility function to discover and register feature flags from a directory
 */
export declare function discoverAndRegisterFeatureFlags(options: DiscoverAndRegisterOptions): Promise<void>;
//# sourceMappingURL=discover-and-register-feature-flags.d.ts.map