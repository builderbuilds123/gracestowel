"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableSortableHeaderCell = void 0;
const tslib_1 = require("tslib");
const React = tslib_1.__importStar(require("react"));
const sortable_1 = require("@dnd-kit/sortable");
const utilities_1 = require("@dnd-kit/utilities");
const clx_1 = require("../../../utils/clx");
const table_1 = require("../../../components/table");
exports.DataTableSortableHeaderCell = React.forwardRef(({ id, children, className, style: propStyle, isFirstColumn, ...props }, ref) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, } = (0, sortable_1.useSortable)({
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
        transform: transformStyle ? utilities_1.CSS.Transform.toString(transformStyle) : undefined,
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
    return (React.createElement(table_1.Table.HeaderCell, { ref: combineRefs, style: style, className: (0, clx_1.clx)(className, "group/header-cell bg-ui-bg-base"), ...attributes, ...listeners, ...props }, children));
});
exports.DataTableSortableHeaderCell.displayName = "DataTableSortableHeaderCell";
//# sourceMappingURL=data-table-sortable-header-cell.js.map