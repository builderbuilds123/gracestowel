import { LoaderOptions, ModulesSdkTypes } from "@medusajs/types";
/**
 * Utility function to build a migration generation script that will generate the migrations.
 * Only used in mikro orm based modules.
 * @param moduleName
 * @param models
 * @param pathToMigrations
 */
export declare function buildGenerateMigrationScript({ moduleName, models, pathToMigrations, }: {
    moduleName: any;
    models: any;
    pathToMigrations: any;
}): ({ options, logger }?: Pick<LoaderOptions<ModulesSdkTypes.ModuleServiceInitializeOptions>, "logger" | "options">) => Promise<void>;
//# sourceMappingURL=migration-generate.d.ts.map