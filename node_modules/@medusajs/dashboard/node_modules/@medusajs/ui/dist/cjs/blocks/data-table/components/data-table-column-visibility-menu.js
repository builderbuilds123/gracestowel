"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableColumnVisibilityMenu = void 0;
const tslib_1 = require("tslib");
const react_1 = tslib_1.__importDefault(require("react"));
const checkbox_1 = require("../../../components/checkbox");
const dropdown_menu_1 = require("../../../components/dropdown-menu");
const icon_button_1 = require("../../../components/icon-button");
const tooltip_1 = require("../../../components/tooltip");
const icons_1 = require("@medusajs/icons");
const use_data_table_context_1 = require("../context/use-data-table-context");
const DataTableColumnVisibilityMenu = ({ className, tooltip, }) => {
    const { instance, enableColumnVisibility } = (0, use_data_table_context_1.useDataTableContext)();
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
    const Wrapper = tooltip ? tooltip_1.Tooltip : react_1.default.Fragment;
    const wrapperProps = tooltip ? { content: tooltip } : {};
    return (react_1.default.createElement(dropdown_menu_1.DropdownMenu, null,
        react_1.default.createElement(Wrapper, { ...wrapperProps },
            react_1.default.createElement(dropdown_menu_1.DropdownMenu.Trigger, { asChild: true },
                react_1.default.createElement(icon_button_1.IconButton, { size: "small", className: className },
                    react_1.default.createElement(icons_1.Adjustments, null)))),
        react_1.default.createElement(dropdown_menu_1.DropdownMenu.Content, { align: "end", className: "min-w-[200px] max-h-[400px] overflow-hidden" },
            react_1.default.createElement(dropdown_menu_1.DropdownMenu.Label, null, "Toggle columns"),
            react_1.default.createElement(dropdown_menu_1.DropdownMenu.Separator, null),
            react_1.default.createElement(dropdown_menu_1.DropdownMenu.Item, { onSelect: (e) => {
                    e.preventDefault();
                    handleToggleAll(!allColumnsVisible);
                } },
                react_1.default.createElement("div", { className: "flex items-center gap-x-2" },
                    react_1.default.createElement(checkbox_1.Checkbox, { checked: allColumnsVisible ? true : (someColumnsVisible && !allColumnsVisible) ? "indeterminate" : false }),
                    react_1.default.createElement("span", null, "Toggle all"))),
            react_1.default.createElement(dropdown_menu_1.DropdownMenu.Separator, null),
            react_1.default.createElement("div", { className: "max-h-[250px] overflow-y-auto" }, columns.map((column) => {
                var _a;
                return (react_1.default.createElement(dropdown_menu_1.DropdownMenu.Item, { key: column.id, onSelect: (e) => {
                        e.preventDefault();
                        handleToggleColumn(column);
                    } },
                    react_1.default.createElement("div", { className: "flex items-center gap-x-2" },
                        react_1.default.createElement(checkbox_1.Checkbox, { checked: column.getIsVisible() }),
                        react_1.default.createElement("span", { className: "truncate" }, ((_a = column.columnDef.meta) === null || _a === void 0 ? void 0 : _a.name) || column.id))));
            })))));
};
exports.DataTableColumnVisibilityMenu = DataTableColumnVisibilityMenu;
//# sourceMappingURL=data-table-column-visibility-menu.js.map