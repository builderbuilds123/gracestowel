import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clx } from "../../../utils/clx";
import { Table } from "../../../components/table";
export const DataTableSortableHeaderCell = React.forwardRef(({ id, children, className, style: propStyle, isFirstColumn, ...props }, ref) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, } = useSortable({
        id,
    });
    // Only apply horizontal transform, ignore vertical movement
    const transformStyle = transform ? {
        x: transform.x,
        y: 0,
        scaleX: 1,
        scaleY: 1
    } : null;
    const style = {
        ...propStyle,
        transform: transformStyle ? CSS.Transform.toString(transformStyle) : undefined,
        transition,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 50 : isFirstColumn ? 1 : undefined,
    };
    const combineRefs = (element) => {
        setNodeRef(element);
        if (ref) {
            if (typeof ref === 'function') {
                ref(element);
            }
            else {
                ref.current = element;
            }
        }
    };
    return (React.createElement(Table.HeaderCell, { ref: combineRefs, style: style, className: clx(className, "group/header-cell bg-ui-bg-base"), ...attributes, ...listeners, ...props }, children));
});
DataTableSortableHeaderCell.displayName = "DataTableSortableHeaderCell";
//# sourceMappingURL=data-table-sortable-header-cell.js.map