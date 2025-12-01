"use client";
import * as React from "react";
import { DataTableContext } from "./data-table-context";
const DataTableContextProvider = ({ instance, children, }) => {
    return (React.createElement(DataTableContext.Provider, { value: {
            instance,
            enableColumnVisibility: instance.enableColumnVisibility,
            enableColumnOrder: instance.enableColumnOrder
        } }, children));
};
export { DataTableContextProvider };
//# sourceMappingURL=data-table-context-provider.js.map