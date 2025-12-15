"use client";
import { Checkbox } from "../../../components/checkbox";
import * as React from "react";
const DataTableSelectCell = (props) => {
    const checked = props.ctx.row.getIsSelected();
    const onChange = props.ctx.row.getToggleSelectedHandler();
    const disabled = !props.ctx.row.getCanSelect();
    return (React.createElement(Checkbox, { onClick: (e) => e.stopPropagation(), checked: checked, onCheckedChange: onChange, disabled: disabled }));
};
DataTableSelectCell.displayName = "DataTable.SelectCell";
const DataTableSelectHeader = (props) => {
    const checked = props.ctx.table.getIsSomePageRowsSelected()
        ? "indeterminate"
        : props.ctx.table.getIsAllPageRowsSelected();
    const onChange = (checked) => {
        props.ctx.table.toggleAllPageRowsSelected(!!checked);
    };
    const disabled = !props.ctx.table
        .getRowModel()
        .rows.some((row) => row.getCanSelect());
    return (React.createElement(Checkbox, { onClick: (e) => e.stopPropagation(), checked: checked, onCheckedChange: onChange, disabled: disabled }));
};
export { DataTableSelectCell, DataTableSelectHeader };
//# sourceMappingURL=data-table-select-cell.js.map