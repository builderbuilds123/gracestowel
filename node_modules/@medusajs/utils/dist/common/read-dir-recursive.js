"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readDir = readDir;
exports.readDirRecursive = readDirRecursive;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const MISSING_NODE_ERRORS = ["ENOTDIR", "ENOENT"];
async function readDir(dir, options) {
    try {
        const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
        return entries;
    }
    catch (error) {
        if (options?.ignoreMissing && MISSING_NODE_ERRORS.includes(error.code)) {
            return [];
        }
        throw error;
    }
}
async function readDirRecursive(dir, options) {
    let allEntries = [];
    const readRecursive = async (dir, depth = 1) => {
        const maxDepth = options?.maxDepth ?? Infinity;
        try {
            const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry.name);
                Object.defineProperty(entry, "path", {
                    value: dir,
                });
                allEntries.push(entry);
                if (entry.isDirectory() && depth < maxDepth) {
                    await readRecursive(fullPath, depth + 1);
                }
            }
        }
        catch (error) {
            if (options?.ignoreMissing && error.code === "ENOENT") {
                return;
            }
            throw error;
        }
    };
    await readRecursive(dir);
    return allEntries;
}
//# sourceMappingURL=read-dir-recursive.js.map