import { Dirent } from "fs";
export declare function readDir(dir: string, options?: {
    ignoreMissing?: boolean;
}): Promise<Dirent<string>[]>;
export declare function readDirRecursive(dir: string, options?: {
    ignoreMissing?: boolean;
    maxDepth?: number;
}): Promise<Dirent[]>;
//# sourceMappingURL=read-dir-recursive.d.ts.map