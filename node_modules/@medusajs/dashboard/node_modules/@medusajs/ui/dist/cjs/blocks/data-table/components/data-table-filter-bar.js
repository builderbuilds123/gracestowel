"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableFilterBar = void 0;
const tslib_1 = require("tslib");
const React = tslib_1.__importStar(require("react"));
const data_table_filter_1 = require("../../data-table/components/data-table-filter");
const data_table_filter_menu_1 = require("../../data-table/components/data-table-filter-menu");
const data_table_sorting_menu_1 = require("../../data-table/components/data-table-sorting-menu");
const data_table_column_visibility_menu_1 = require("../../data-table/components/data-table-column-visibility-menu");
const use_data_table_context_1 = require("../../data-table/context/use-data-table-context");
const skeleton_1 = require("../../../components/skeleton");
const DataTableFilterBar = ({ clearAllFiltersLabel = "Clear all", alwaysShow = false, sortingTooltip, columnsTooltip, children, }) => {
    const { instance, enableColumnVisibility } = (0, use_data_table_context_1.useDataTableContext)();
    // Local state for managing intermediate filters
    const [localFilters, setLocalFilters] = React.useState([]);
    const parentFilterState = instance.getFiltering();
    const availableFilters = instance.getFilters();
    // Sync parent filters with local state
    React.useEffect(() => {
        setLocalFilters(prevLocalFilters => {
            const parentIds = Object.keys(parentFilterState);
            const localIds = prevLocalFilters.map(f => f.id);
            // Remove local filters that have been removed from parent
            const updatedLocalFilters = prevLocalFilters.filter(f => parentIds.includes(f.id) || f.isNew);
            // Add parent filters that don't exist locally
            parentIds.forEach(id => {
                if (!localIds.includes(id)) {
                    updatedLocalFilters.push({
                        id,
                        value: parentFilterState[id],
                        isNew: false
                    });
                }
            });
            // Only update if there's an actual change
            if (updatedLocalFilters.length !== prevLocalFilters.length ||
                updatedLocalFilters.some((f, i) => { var _a; return f.id !== ((_a = prevLocalFilters[i]) === null || _a === void 0 ? void 0 : _a.id); })) {
                return updatedLocalFilters;
            }
            return prevLocalFilters;
        });
    }, [parentFilterState]);
    // Add a new filter locally
    const addLocalFilter = React.useCallback((id, value) => {
        setLocalFilters(prev => [...prev, { id, value, isNew: true }]);
    }, []);
    // Update a local filter's value
    const updateLocalFilter = React.useCallback((id, value) => {
        setLocalFilters(prev => prev.map(f => f.id === id ? { ...f, value, isNew: false } : f));
        // If the filter has a meaningful value, propagate to parent
        if (value !== undefined && value !== null && value !== '' &&
            !(Array.isArray(value) && value.length === 0)) {
            instance.updateFilter({ id, value });
        }
    }, [instance]);
    // Remove a local filter
    const removeLocalFilter = React.useCallback((id) => {
        setLocalFilters(prev => prev.filter(f => f.id !== id));
        // Also remove from parent if it exists there
        if (parentFilterState[id] !== undefined) {
            instance.removeFilter(id);
        }
    }, [instance, parentFilterState]);
    const clearFilters = React.useCallback(() => {
        setLocalFilters([]);
        instance.clearFilters();
    }, [instance]);
    const filterCount = localFilters.length;
    const hasAvailableFilters = availableFilters.length > 0;
    // Check if sorting is enabled
    const sortableColumns = instance.getAllColumns().filter((column) => column.getCanSort());
    const hasSorting = instance.enableSorting && sortableColumns.length > 0;
    // Always show the filter bar when there are available filters, sorting, column visibility, or when forced
    if (filterCount === 0 && !hasAvailableFilters && !hasSorting && !enableColumnVisibility && !alwaysShow && !children) {
        return null;
    }
    if (instance.showSkeleton) {
        return React.createElement(DataTableFilterBarSkeleton, { filterCount: filterCount });
    }
    return (React.createElement("div", { className: "bg-ui-bg-subtle flex w-full flex-nowrap items-center justify-between gap-2 overflow-x-auto border-t px-6 py-2" },
        React.createElement("div", { className: "flex flex-nowrap items-center gap-2 md:flex-wrap" },
            localFilters.map((localFilter) => (React.createElement(data_table_filter_1.DataTableFilter, { key: localFilter.id, id: localFilter.id, filter: localFilter.value, isNew: localFilter.isNew, onUpdate: (value) => updateLocalFilter(localFilter.id, value), onRemove: () => removeLocalFilter(localFilter.id) }))),
            hasAvailableFilters && (React.createElement(data_table_filter_menu_1.DataTableFilterMenu, { onAddFilter: addLocalFilter }))),
        React.createElement("div", { className: "flex flex-shrink-0 items-center gap-2" },
            hasSorting && React.createElement(data_table_sorting_menu_1.DataTableSortingMenu, { tooltip: sortingTooltip }),
            enableColumnVisibility && React.createElement(data_table_column_visibility_menu_1.DataTableColumnVisibilityMenu, { tooltip: columnsTooltip }),
            children)));
};
exports.DataTableFilterBar = DataTableFilterBar;
DataTableFilterBar.displayName = "DataTable.FilterBar";
const DataTableFilterBarSkeleton = ({ filterCount, }) => {
    return (React.createElement("div", { className: "bg-ui-bg-subtle flex w-full flex-nowrap items-center gap-2 overflow-x-auto border-t px-6 py-2 md:flex-wrap" },
        Array.from({ length: filterCount }).map((_, index) => (React.createElement(skeleton_1.Skeleton, { key: index, className: "h-7 w-[180px]" }))),
        filterCount > 0 ? React.createElement(skeleton_1.Skeleton, { className: "h-7 w-[66px]" }) : null));
};
//# sourceMappingURL=data-table-filter-bar.js.map