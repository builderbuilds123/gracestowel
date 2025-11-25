import { DataTableFilterBar } from "../../data-table/components/data-table-filter-bar";
import { useDataTableContext } from "../../data-table/context/use-data-table-context";
import { clx } from "../../../utils/clx";
import * as React from "react";
/**
 * Toolbar shown for the data table.
 */
const DataTableToolbar = (props) => {
    var _a, _b, _c;
    const { instance } = useDataTableContext();
    const hasFilters = instance.getFilters().length > 0;
    return (React.createElement("div", { className: "flex flex-col divide-y" },
        React.createElement("div", { className: clx("flex items-center px-6 py-4", props.className) }, props.children),
        React.createElement(DataTableFilterBar, { clearAllFiltersLabel: (_a = props.translations) === null || _a === void 0 ? void 0 : _a.clearAll, alwaysShow: hasFilters, sortingTooltip: (_b = props.translations) === null || _b === void 0 ? void 0 : _b.sort, columnsTooltip: (_c = props.translations) === null || _c === void 0 ? void 0 : _c.columns }, props.filterBarContent)));
};
export { DataTableToolbar };
//# sourceMappingURL=data-table-toolbar.js.map