import { AdminCreateProduct } from "@medusajs/types";
type NormalizedRow = (Record<string, string | number | boolean> & {
    "product id": string;
    "product handle": string;
}) | {
    "product id"?: string;
    "product handle": string;
} | {
    "product id": string;
    "product handle"?: string;
};
/**
 * CSV normalizer processes all the allowed columns from a CSV file and remaps
 * them into a new object with properties matching the "AdminCreateProduct".
 *
 * However, further validations must be performed to validate the format and
 * the required fields in the normalized output.
 */
export declare class CSVNormalizer {
    #private;
    /**
     * Normalizes a row by converting all keys to lowercase and removing
     * the leading "\r" from the keys and the values.
     *
     * Also, it values the row to contain unknown columns and must contain
     * the "product id" or "product handle" columns.
     */
    static preProcess(row: Record<string, string | boolean | number>, rowNumber: number): NormalizedRow;
    constructor(rows: NormalizedRow[]);
    /**
     * Process CSV rows. The return value is a tree of products
     */
    proccess(resumingFromIndex?: number): {
        toCreate: {
            [handle: string]: { [K in keyof AdminCreateProduct]?: any; };
        };
        toUpdate: {
            [id: string]: { [K in keyof AdminCreateProduct]?: any; };
        };
    };
}
export {};
//# sourceMappingURL=csv-normalizer.d.ts.map