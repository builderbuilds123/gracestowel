"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.gqlSchemaToTypes = gqlSchemaToTypes;
const core_1 = require("@graphql-codegen/core");
const typescriptPlugin = __importStar(require("@graphql-codegen/typescript"));
const graphql_1 = require("graphql");
const common_1 = require("../common");
function buildEntryPointsTypeMap({ schema, joinerConfigs, }) {
    // build map entry point to there type to be merged and used by the remote query
    return joinerConfigs.flatMap((config) => {
        const aliases = Array.isArray(config.alias)
            ? config.alias
            : config.alias
                ? [config.alias]
                : [];
        return aliases
            .flatMap((alias) => {
            const names = Array.isArray(alias.name) ? alias.name : [alias.name];
            const entity = alias?.["entity"];
            return names.map((aliasItem) => {
                return {
                    entryPoint: aliasItem,
                    entityType: entity
                        ? schema.includes(`export type ${entity} `)
                            ? alias?.["entity"]
                            : "any"
                        : "any",
                };
            });
        })
            .filter(Boolean);
    });
}
async function generateTypes({ outputDir, filename, interfaceName, config, joinerConfigs, }) {
    const fileSystem = new common_1.FileSystem(outputDir);
    let output = 'import "@medusajs/framework/types"\n';
    output += await (0, core_1.codegen)(config);
    const entryPoints = buildEntryPointsTypeMap({ schema: output, joinerConfigs });
    const remoteQueryEntryPoints = `
declare module '@medusajs/framework/types' {
  interface ${interfaceName} {
${entryPoints
        .map((entry) => `    ${entry.entryPoint}: ${entry.entityType}`)
        .join("\n")}
  }
}`;
    output += remoteQueryEntryPoints;
    const barrelFileName = "index.d.ts";
    await fileSystem.create(filename + ".d.ts", output);
    const doesBarrelExists = await fileSystem.exists(barrelFileName);
    if (!doesBarrelExists) {
        await fileSystem.create(barrelFileName, `export * as ${interfaceName}Types from './${filename}'`);
    }
    else {
        const content = await fileSystem.contents(barrelFileName);
        if (!content.includes(`${interfaceName}Types`)) {
            const newContent = `export * as ${interfaceName}Types from './${filename}'\n${content}`;
            await fileSystem.create(barrelFileName, newContent);
        }
    }
}
const getEnumValues = (schema) => {
    const enumTypes = Object.values(schema.getTypeMap()).filter((type) => type.astNode?.kind === graphql_1.Kind.ENUM_TYPE_DEFINITION);
    const enumValues = {};
    enumTypes.forEach((type) => {
        const enumName = type.name;
        enumValues[enumName] = {};
        const nodes = type.astNode.values || [];
        nodes.forEach((node) => {
            const directive = node.directives?.find((d) => d.name.value === "enumValue");
            if (directive) {
                const valueArg = directive.arguments?.find((a) => a.name.value === "value");
                if (valueArg && valueArg.value.kind === graphql_1.Kind.STRING) {
                    enumValues[enumName][node.name.value] = valueArg.value.value;
                }
            }
        });
    });
    return enumValues;
};
// TODO: rename from gqlSchemaToTypes to grapthqlToTsTypes
async function gqlSchemaToTypes({ schema, outputDir, filename, joinerConfigs, interfaceName, }) {
    const config = {
        documents: [],
        config: {
            scalars: {
                DateTime: { input: "Date | string", output: "Date | string" },
                JSON: {
                    input: "Record<string, unknown>",
                    output: "Record<string, unknown>",
                },
            },
            avoidOptionals: {
                field: true, // Avoid optional fields in types
            },
        },
        filename: "",
        schema: (0, graphql_1.parse)((0, graphql_1.printSchema)(schema)),
        plugins: [
            {
                typescript: {
                    enumValues: getEnumValues(schema),
                    enumsAsTypes: true,
                },
            },
        ],
        pluginMap: {
            typescript: typescriptPlugin,
        },
    };
    await generateTypes({
        outputDir,
        filename,
        config,
        joinerConfigs,
        interfaceName,
    });
}
//# sourceMappingURL=graphql-to-ts-types.js.map