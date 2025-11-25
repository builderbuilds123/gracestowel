import { UseDataTableReturn } from "../use-data-table";
export interface DataTableContextValue<TData> {
    instance: UseDataTableReturn<TData>;
    enableColumnVisibility: boolean;
    enableColumnOrder: boolean;
}
export declare const DataTableContext: import("react").Context<DataTableContextValue<any> | null>;
//# sourceMappingURL=data-table-context.d.ts.map