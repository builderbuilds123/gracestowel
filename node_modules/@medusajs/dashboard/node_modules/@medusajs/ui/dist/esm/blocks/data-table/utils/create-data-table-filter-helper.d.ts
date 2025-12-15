import { DeepKeys } from "@tanstack/react-table";
import { DataTableFilter, DataTableFilterProps } from "../types";
declare const createDataTableFilterHelper: <TData>() => {
    accessor: (accessor: DeepKeys<TData>, props: DataTableFilterProps) => {
        type: "radio";
        options: import("../types").DataTableFilterOption[];
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "select";
        options: import("../types").DataTableFilterOption[];
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "date";
        format?: "date" | "date-time";
        rangeOptionLabel?: string;
        rangeOptionStartLabel?: string;
        rangeOptionEndLabel?: string;
        disableRangeOption?: boolean;
        formatDateValue?: (value: Date) => string;
        options: import("../types").DataTableFilterOption<import("../types").DataTableDateComparisonOperator>[];
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "multiselect";
        options: import("../types").DataTableFilterOption[];
        searchable?: boolean;
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "string";
        placeholder?: string;
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "number";
        placeholder?: string;
        includeOperators?: boolean;
        label: string;
        id: DeepKeys<TData>;
    } | {
        type: "custom";
        render: (props: {
            value: any;
            onChange: (value: any) => void;
            onRemove: () => void;
        }) => React.ReactNode;
        label: string;
        id: DeepKeys<TData>;
    };
    custom: <T extends DataTableFilterProps>(props: DataTableFilter<T>) => DataTableFilter<T>;
};
export { createDataTableFilterHelper };
//# sourceMappingURL=create-data-table-filter-helper.d.ts.map