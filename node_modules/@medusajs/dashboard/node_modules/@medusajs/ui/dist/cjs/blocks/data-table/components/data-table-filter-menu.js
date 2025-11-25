"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableFilterMenu = void 0;
const tslib_1 = require("tslib");
const React = tslib_1.__importStar(require("react"));
const use_data_table_context_1 = require("../../data-table/context/use-data-table-context");
const dropdown_menu_1 = require("../../../components/dropdown-menu");
const icon_button_1 = require("../../../components/icon-button");
const skeleton_1 = require("../../../components/skeleton");
const tooltip_1 = require("../../../components/tooltip");
const icons_1 = require("@medusajs/icons");
/**
 * This component adds a filter menu to the data table, allowing users
 * to filter the table's data.
 */
const DataTableFilterMenu = ({ tooltip, onAddFilter }) => {
    const { instance } = (0, use_data_table_context_1.useDataTableContext)();
    const enabledFilters = Object.keys(instance.getFiltering());
    const filterOptions = instance
        .getFilters()
        .filter((filter) => !enabledFilters.includes(filter.id));
    if (!enabledFilters.length && !filterOptions.length) {
        throw new Error("DataTable.FilterMenu was rendered but there are no filters to apply. Make sure to pass filters to 'useDataTable'");
    }
    const Wrapper = tooltip ? tooltip_1.Tooltip : React.Fragment;
    const wrapperProps = tooltip
        ? { content: tooltip, hidden: filterOptions.length === 0 }
        : {};
    if (instance.showSkeleton) {
        return React.createElement(DataTableFilterMenuSkeleton, null);
    }
    return (React.createElement(dropdown_menu_1.DropdownMenu, null,
        React.createElement(Wrapper, { ...wrapperProps },
            React.createElement(dropdown_menu_1.DropdownMenu.Trigger, { asChild: true, disabled: filterOptions.length === 0 },
                React.createElement(icon_button_1.IconButton, { size: "small" },
                    React.createElement(icons_1.Funnel, null)))),
        React.createElement(dropdown_menu_1.DropdownMenu.Content, { side: "bottom", align: "start" }, filterOptions.map((filter) => {
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
            return (React.createElement(dropdown_menu_1.DropdownMenu.Item, { key: filter.id, onClick: (e) => {
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
exports.DataTableFilterMenu = DataTableFilterMenu;
DataTableFilterMenu.displayName = "DataTable.FilterMenu";
const DataTableFilterMenuSkeleton = () => {
    return React.createElement(skeleton_1.Skeleton, { className: "size-7" });
};
//# sourceMappingURL=data-table-filter-menu.js.map