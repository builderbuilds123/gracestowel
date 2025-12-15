import { InputFileConfig } from "@medusajs/types";
export declare const MEDUSA_SKIP_FILE: unique symbol;
export declare function defineFileConfig(config?: InputFileConfig): void;
export declare function getDefinedFileConfig(path?: string): any;
export declare function isFileDisabled(path?: string): boolean;
export declare function isFileSkipped(exported: unknown): boolean;
//# sourceMappingURL=define-file-config.d.ts.map