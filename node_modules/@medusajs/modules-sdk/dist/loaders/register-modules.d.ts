import { ExternalModuleDeclaration, InternalModuleDeclaration, ModuleDefinition, ModuleExports, ModuleResolution } from "@medusajs/types";
export declare const registerMedusaModule: ({ moduleKey, moduleDeclaration, moduleExports, definition, cwd, }: {
    moduleKey: string;
    moduleDeclaration?: Partial<InternalModuleDeclaration | ExternalModuleDeclaration> | string | false;
    moduleExports?: ModuleExports;
    definition?: ModuleDefinition;
    cwd?: string;
}) => Record<string, ModuleResolution>;
export declare const registerMedusaLinkModule: (definition: ModuleDefinition, moduleDeclaration: Partial<InternalModuleDeclaration>, moduleExports?: ModuleExports, cwd?: string) => Record<string, ModuleResolution>;
//# sourceMappingURL=register-modules.d.ts.map