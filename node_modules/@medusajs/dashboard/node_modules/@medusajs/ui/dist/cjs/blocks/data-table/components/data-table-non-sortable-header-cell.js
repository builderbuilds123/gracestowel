"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableNonSortableHeaderCell = void 0;
const tslib_1 = require("tslib");
const React = tslib_1.__importStar(require("react"));
const sortable_1 = require("@dnd-kit/sortable");
const utilities_1 = require("@dnd-kit/utilities");
const table_1 = require("../../../components/table");
exports.DataTableNonSortableHeaderCell = React.forwardRef(({ id, children, className, style: propStyle, isFirstColumn, ...props }, ref) => {
    // Still use sortable hook but without listeners
    const { setNodeRef, transform, transition, } = (0, sortable_1.useSortable)({
        id,
        disabled: true, // Disable dragging
    });
    // Only apply horizontal transform for smooth shifting
    const transformStyle = transform ? {
        x: transform.x,
        y: 0,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
    } : null;
    const style = {
        ...propStyle,
        transform: transformStyle ? utilities_1.CSS.Transform.toString(transformStyle) : undefined,
        transition,
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
    return (React.createElement(table_1.Table.HeaderCell, { ref: combineRefs, style: style, className: className, ...props }, children));
});
exports.DataTableNonSortableHeaderCell.displayName = "DataTableNonSortableHeaderCell";
//# sourceMappingURL=data-table-non-sortable-header-cell.js.map