import React from "react";
import { Checkbox } from "../../../components/checkbox";
import { DropdownMenu } from "../../../components/dropdown-menu";
import { IconButton } from "../../../components/icon-button";
import { Tooltip } from "../../../components/tooltip";
import { Adjustments } from "@medusajs/icons";
import { useDataTableContext } from "../context/use-data-table-context";
const DataTableColumnVisibilityMenu = ({ className, tooltip, }) => {
    const { instance, enableColumnVisibility } = useDataTableContext();
    if (!enableColumnVisibility) {
        return null;
    }
    const columns = instance
        .getAllColumns()
        .filter((column) => column.getCanHide());
    const handleToggleColumn = (column) => {
        column.toggleVisibility();
    };
    const handleToggleAll = (value) => {
        instance.setColumnVisibility(Object.fromEntries(columns.map((column) => [column.id, value])));
    };
    const allColumnsVisible = columns.every((column) => column.getIsVisible());
    const someColumnsVisible = columns.some((column) => column.getIsVisible());
    const Wrapper = tooltip ? Tooltip : React.Fragment;
    const wrapperProps = tooltip ? { content: tooltip } : {};
    return (React.createElement(DropdownMenu, null,
        React.createElement(Wrapper, { ...wrapperProps },
            React.createElement(DropdownMenu.Trigger, { asChild: true },
                React.createElement(IconButton, { size: "small", className: className },
                    React.createElement(Adjustments, null)))),
        React.createElement(DropdownMenu.Content, { align: "end", className: "min-w-[200px] max-h-[400px] overflow-hidden" },
            React.createElement(DropdownMenu.Label, null, "Toggle columns"),
            React.createElement(DropdownMenu.Separator, null),
            React.createElement(DropdownMenu.Item, { onSelect: (e) => {
                    e.preventDefault();
                    handleToggleAll(!allColumnsVisible);
                } },
                React.createElement("div", { className: "flex items-center gap-x-2" },
                    React.createElement(Checkbox, { checked: allColumnsVisible ? true : (someColumnsVisible && !allColumnsVisible) ? "indeterminate" : false }),
                    React.createElement("span", null, "Toggle all"))),
            React.createElement(DropdownMenu.Separator, null),
            React.createElement("div", { className: "max-h-[250px] overflow-y-auto" }, columns.map((column) => {
                var _a;
                return (React.createElement(DropdownMenu.Item, { key: column.id, onSelect: (e) => {
                        e.preventDefault();
                        handleToggleColumn(column);
                    } },
                    React.createElement("div", { className: "flex items-center gap-x-2" },
                        React.createElement(Checkbox, { checked: column.getIsVisible() }),
                        React.createElement("span", { className: "truncate" }, ((_a = column.columnDef.meta) === null || _a === void 0 ? void 0 : _a.name) || column.id))));
            })))));
};
export { DataTableColumnVisibilityMenu };
//# sourceMappingURL=data-table-column-visibility-menu.js.map