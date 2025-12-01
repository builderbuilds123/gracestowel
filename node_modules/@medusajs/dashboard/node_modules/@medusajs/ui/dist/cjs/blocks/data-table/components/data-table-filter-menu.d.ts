import * as React from "react";
interface DataTableFilterMenuProps {
    /**
     * The tooltip to show when hovering over the filter menu.
     */
    tooltip?: string;
    /**
     * Callback when a filter is added
     */
    onAddFilter?: (id: string, value: unknown) => void;
}
/**
 * This component adds a filter menu to the data table, allowing users
 * to filter the table's data.
 */
declare const DataTableFilterMenu: {
    ({ tooltip, onAddFilter }: DataTableFilterMenuProps): React.JSX.Element;
    displayName: string;
};
export { DataTableFilterMenu };
export type { DataTableFilterMenuProps };
//# sourceMappingURL=data-table-filter-menu.d.ts.map