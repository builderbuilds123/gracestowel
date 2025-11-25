import * as React from "react";
import { useDataTableContext } from "../../data-table/context/use-data-table-context";
import { DropdownMenu } from "../../../components/dropdown-menu";
import { IconButton } from "../../../components/icon-button";
import { Skeleton } from "../../../components/skeleton";
import { Tooltip } from "../../../components/tooltip";
import { Funnel } from "@medusajs/icons";
/**
 * This component adds a filter menu to the data table, allowing users
 * to filter the table's data.
 */
const DataTableFilterMenu = ({ tooltip, onAddFilter }) => {
    const { instance } = useDataTableContext();
    const enabledFilters = Object.keys(instance.getFiltering());
    const filterOptions = instance
        .getFilters()
        .filter((filter) => !enabledFilters.includes(filter.id));
    if (!enabledFilters.length && !filterOptions.length) {
        throw new Error("DataTable.FilterMenu was rendered but there are no filters to apply. Make sure to pass filters to 'useDataTable'");
    }
    const Wrapper = tooltip ? Tooltip : React.Fragment;
    const wrapperProps = tooltip
        ? { content: tooltip, hidden: filterOptions.length === 0 }
        : {};
    if (instance.showSkeleton) {
        return React.createElement(DataTableFilterMenuSkeleton, null);
    }
    return (React.createElement(DropdownMenu, null,
        React.createElement(Wrapper, { ...wrapperProps },
            React.createElement(DropdownMenu.Trigger, { asChild: true, disabled: filterOptions.length === 0 },
                React.createElement(IconButton, { size: "small" },
                    React.createElement(Funnel, null)))),
        React.createElement(DropdownMenu.Content, { side: "bottom", align: "start" }, filterOptions.map((filter) => {
            const getDefaultValue = () => {
                switch (filter.type) {
                    case "select":
                    case "multiselect":
                        return [];
                    case "string":
                        return "";
                    case "number":
                        return null;
                    case "date":
                        return null;
                    case "radio":
                        return null;
                    case "custom":
                        return null;
                    default:
                        return null;
                }
            };
            return (React.createElement(DropdownMenu.Item, { key: filter.id, onClick: (e) => {
                    // Prevent any bubbling that might interfere
                    e.stopPropagation();
                    if (onAddFilter) {
                        onAddFilter(filter.id, getDefaultValue());
                    }
                    else {
                        instance.addFilter({ id: filter.id, value: getDefaultValue() });
                    }
                } }, filter.label));
        }))));
};
DataTableFilterMenu.displayName = "DataTable.FilterMenu";
const DataTableFilterMenuSkeleton = () => {
    return React.createElement(Skeleton, { className: "size-7" });
};
export { DataTableFilterMenu };
//# sourceMappingURL=data-table-filter-menu.js.map