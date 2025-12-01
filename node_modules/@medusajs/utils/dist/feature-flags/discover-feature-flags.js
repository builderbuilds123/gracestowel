"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverFeatureFlagsFromDir = discoverFeatureFlagsFromDir;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const common_1 = require("../common");
const excludedFiles = ["index.js", "index.ts"];
const excludedExtensions = [".d.ts", ".d.ts.map", ".js.map"];
function isFeatureFlag(flag) {
    const f = flag;
    return !!f && (0, common_1.isString)(f.key) && (0, common_1.isString)(f.env_key);
}
/**
 * Discover feature flag definitions from a directory and subdirectories
 */
async function discoverFeatureFlagsFromDir(sourcePath, maxDepth = 2) {
    if (!sourcePath) {
        return [];
    }
    const root = (0, path_1.normalize)(sourcePath);
    const discovered = [];
    const allEntries = await (0, common_1.readDirRecursive)(root, {
        ignoreMissing: true,
        maxDepth,
    });
    const featureFlagDirs = allEntries
        .filter((e) => e.isDirectory() && e.name === "feature-flags")
        .map((e) => (0, path_1.join)(e.path, e.name));
    if (!featureFlagDirs.length) {
        return discovered;
    }
    await Promise.all(featureFlagDirs.map(async (scanDir) => {
        const entries = await (0, promises_1.readdir)(scanDir, { withFileTypes: true });
        await Promise.all(entries.map(async (entry) => {
            if (entry.isDirectory()) {
                return;
            }
            if (excludedExtensions.some((ext) => entry.name.endsWith(ext)) ||
                excludedFiles.includes(entry.name)) {
                return;
            }
            const fileExports = await (0, common_1.dynamicImport)((0, path_1.join)(scanDir, entry.name));
            const values = Object.values(fileExports);
            for (const value of values) {
                if (isFeatureFlag(value)) {
                    discovered.push(value);
                }
            }
        }));
    }));
    return discovered;
}
//# sourceMappingURL=discover-feature-flags.js.map