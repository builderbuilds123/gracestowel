import * as React from "react";
interface DataTableFilterProps {
    id: string;
    filter: unknown;
    isNew?: boolean;
    onUpdate?: (value: unknown) => void;
    onRemove?: () => void;
}
declare const DataTableFilter: {
    ({ id, filter, isNew, onUpdate, onRemove }: DataTableFilterProps): React.JSX.Element | null;
    displayName: string;
};
export { DataTableFilter };
export type { DataTableFilterProps };
//# sourceMappingURL=data-table-filter.d.ts.map