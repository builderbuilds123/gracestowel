import { CheckMini, EllipseMiniSolid, XMark, XMarkMini, MagnifyingGlass } from "@medusajs/icons";
import * as React from "react";
import { useDataTableContext } from "../../data-table/context/use-data-table-context";
import { isDateComparisonOperator } from "../../data-table/utils/is-date-comparison-operator";
import { DatePicker } from "../../../components/date-picker";
import { Label } from "../../../components/label";
import { Popover } from "../../../components/popover";
import { Input } from "../../../components/input";
import { Select } from "../../../components/select";
import { Checkbox } from "../../../components/checkbox";
import { clx } from "../../../utils/clx";
const DEFAULT_FORMAT_DATE_VALUE = (d) => d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
});
const DEFAULT_RANGE_OPTION_LABEL = "Custom";
const DEFAULT_RANGE_OPTION_START_LABEL = "Starting";
const DEFAULT_RANGE_OPTION_END_LABEL = "Ending";
const DataTableFilter = ({ id, filter, isNew = false, onUpdate, onRemove }) => {
    const { instance } = useDataTableContext();
    // Initialize open state based on isNew prop
    const [open, setOpen] = React.useState(isNew);
    const [hasInteracted, setHasInteracted] = React.useState(false);
    const meta = instance.getFilterMeta(id);
    if (!meta) {
        return null;
    }
    const { type, label, ...rest } = meta;
    const options = meta.options;
    // Helper to check if filter has a meaningful value
    const hasValue = React.useMemo(() => {
        if (filter === null || filter === undefined)
            return false;
        if (typeof filter === "string" && filter === "")
            return false;
        if (Array.isArray(filter) && filter.length === 0)
            return false;
        if (typeof filter === "number")
            return true;
        if (isDateComparisonOperator(filter)) {
            return !!(filter.$gte || filter.$lte || filter.$gt || filter.$lt);
        }
        if (typeof filter === "object" && filter !== null) {
            // For number comparison operators
            const keys = Object.keys(filter);
            return keys.length > 0 && filter[keys[0]] !== null && filter[keys[0]] !== undefined;
        }
        return true;
    }, [filter]);
    const onOpenChange = React.useCallback((newOpen) => {
        setOpen(newOpen);
        // Mark as interacted when user closes
        if (!newOpen && open) {
            setHasInteracted(true);
        }
        // If closing without a value, remove filter
        // For new filters that haven't been interacted with, remove immediately
        if (!newOpen && !hasValue) {
            // Only remove if it's a new filter being closed without interaction,
            // or if it's an existing filter with no value
            if ((isNew && !hasInteracted) || !isNew) {
                if (onRemove) {
                    onRemove();
                }
                else {
                    instance.removeFilter(id);
                }
            }
        }
    }, [instance, id, open, hasInteracted, isNew, hasValue, onRemove]);
    const removeFilter = React.useCallback(() => {
        if (onRemove) {
            onRemove();
        }
        else {
            instance.removeFilter(id);
        }
    }, [instance, id, onRemove]);
    const { displayValue, isCustomRange } = React.useMemo(() => {
        var _a, _b, _c, _d, _e;
        let displayValue = null;
        let isCustomRange = false;
        if (typeof filter === "string") {
            // For string filters without options, just show the value
            if (!options || options.length === 0) {
                displayValue = filter;
            }
            else {
                displayValue = (_b = (_a = options === null || options === void 0 ? void 0 : options.find((o) => o.value === filter)) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : null;
            }
        }
        if (typeof filter === "number") {
            displayValue = String(filter);
        }
        if (Array.isArray(filter)) {
            displayValue =
                (_c = filter
                    .map((v) => { var _a; return (_a = options === null || options === void 0 ? void 0 : options.find((o) => o.value === v)) === null || _a === void 0 ? void 0 : _a.label; })
                    .join(", ")) !== null && _c !== void 0 ? _c : null;
        }
        if (isDateComparisonOperator(filter)) {
            // First check if it matches a predefined option
            displayValue =
                (_e = (_d = options === null || options === void 0 ? void 0 : options.find((o) => {
                    if (!isDateComparisonOperator(o.value)) {
                        return false;
                    }
                    return ((filter.$gte === o.value.$gte || (!filter.$gte && !o.value.$gte)) &&
                        (filter.$lte === o.value.$lte || (!filter.$lte && !o.value.$lte)) &&
                        (filter.$gt === o.value.$gt || (!filter.$gt && !o.value.$gt)) &&
                        (filter.$lt === o.value.$lt || (!filter.$lt && !o.value.$lt)));
                })) === null || _d === void 0 ? void 0 : _d.label) !== null && _e !== void 0 ? _e : null;
            // If no match found, it's a custom range
            if (!displayValue && isDateFilterProps(meta)) {
                isCustomRange = true;
                const formatDateValue = meta.formatDateValue
                    ? meta.formatDateValue
                    : DEFAULT_FORMAT_DATE_VALUE;
                if (filter.$gte && !filter.$lte) {
                    displayValue = `${meta.rangeOptionStartLabel || DEFAULT_RANGE_OPTION_START_LABEL} ${formatDateValue(new Date(filter.$gte))}`;
                }
                if (filter.$lte && !filter.$gte) {
                    displayValue = `${meta.rangeOptionEndLabel || DEFAULT_RANGE_OPTION_END_LABEL} ${formatDateValue(new Date(filter.$lte))}`;
                }
                if (filter.$gte && filter.$lte) {
                    displayValue = `${formatDateValue(new Date(filter.$gte))} - ${formatDateValue(new Date(filter.$lte))}`;
                }
            }
        }
        // Handle number comparison operators
        if (typeof filter === "object" && filter !== null && !Array.isArray(filter) && !isDateComparisonOperator(filter)) {
            const operators = {
                $eq: "=",
                $gt: ">",
                $gte: "≥",
                $lt: "<",
                $lte: "≤",
            };
            const op = Object.keys(filter)[0];
            const opLabel = operators[op] || op;
            const value = filter[op];
            if (typeof value === "number") {
                displayValue = `${opLabel} ${value}`;
            }
        }
        return { displayValue, isCustomRange };
    }, [filter, options, meta]);
    return (React.createElement(Popover, { open: open, onOpenChange: onOpenChange, modal: true },
        React.createElement("div", { className: clx("bg-ui-bg-field flex flex-shrink-0 items-stretch overflow-hidden rounded-md", "txt-compact-small-plus shadow-borders-base") },
            !hasValue && isNew && React.createElement(Popover.Anchor, null),
            React.createElement("div", { className: clx("flex items-center px-2 py-1 text-ui-fg-muted", {
                    "border-r": hasValue
                }) }, label || id),
            hasValue && (React.createElement(React.Fragment, null,
                (type === "select" || type === "multiselect" || type === "radio") && (React.createElement("div", { className: "flex items-center border-r px-2 py-1 text-ui-fg-muted" }, "is")),
                React.createElement(Popover.Trigger, { asChild: true },
                    React.createElement("button", { className: clx("flex flex-1 items-center px-2 py-1 outline-none", "hover:bg-ui-bg-base-hover active:bg-ui-bg-base-pressed transition-fg", {
                            "text-ui-fg-subtle": displayValue,
                            "text-ui-fg-muted": !displayValue,
                            "min-w-[80px] justify-center": !displayValue,
                            "border-r": true
                        }) }, displayValue || "\u00A0")),
                React.createElement("button", { type: "button", className: "flex size-7 items-center justify-center text-ui-fg-muted outline-none hover:bg-ui-bg-base-hover active:bg-ui-bg-base-pressed transition-fg", onClick: removeFilter },
                    React.createElement(XMark, null))))),
        React.createElement(Popover.Content, { align: "start", sideOffset: 8, collisionPadding: 16, hideWhenDetached: true, className: "bg-ui-bg-component p-0 outline-none", onOpenAutoFocus: (e) => {
                if (isNew) {
                    // For new filters, ensure the first input gets focus
                    const target = e.currentTarget;
                    if (target) {
                        const firstInput = target.querySelector('input:not([type="hidden"]), [role="list"][tabindex="0"]');
                        firstInput === null || firstInput === void 0 ? void 0 : firstInput.focus();
                    }
                }
            }, onCloseAutoFocus: (e) => {
                // Prevent focus from going to the trigger when closing
                e.preventDefault();
            }, onInteractOutside: (e) => {
                // Check if the click is on a filter menu item
                const target = e.target;
                if (target.closest('[role="menuitem"]')) {
                    e.preventDefault();
                }
            } }, (() => {
            switch (type) {
                case "select":
                    return (React.createElement(DataTableFilterSelectContent, { id: id, filter: filter, options: options, isNew: isNew, onUpdate: onUpdate }));
                case "radio":
                    return (React.createElement(DataTableFilterRadioContent, { id: id, filter: filter, options: options, onUpdate: onUpdate }));
                case "date":
                    const dateRest = rest;
                    return (React.createElement(DataTableFilterDateContent, { id: id, filter: filter, options: options, isCustomRange: isCustomRange, format: dateRest.format, rangeOptionLabel: dateRest.rangeOptionLabel, disableRangeOption: dateRest.disableRangeOption, rangeOptionStartLabel: dateRest.rangeOptionStartLabel, rangeOptionEndLabel: dateRest.rangeOptionEndLabel, onUpdate: onUpdate }));
                case "multiselect":
                    const multiselectRest = rest;
                    return (React.createElement(DataTableFilterMultiselectContent, { id: id, filter: filter, options: options, searchable: multiselectRest.searchable, onUpdate: onUpdate }));
                case "string":
                    const stringRest = rest;
                    return (React.createElement(DataTableFilterStringContent, { id: id, filter: filter, placeholder: stringRest.placeholder, onUpdate: onUpdate }));
                case "number":
                    const numberRest = rest;
                    return (React.createElement(DataTableFilterNumberContent, { id: id, filter: filter, placeholder: numberRest.placeholder, includeOperators: numberRest.includeOperators, onUpdate: onUpdate }));
                case "custom":
                    const customRest = rest;
                    return (React.createElement(DataTableFilterCustomContent, { id: id, filter: filter, onRemove: removeFilter, render: customRest.render, onUpdate: onUpdate }));
                default:
                    return null;
            }
        })())));
};
DataTableFilter.displayName = "DataTable.Filter";
const DataTableFilterDateContent = ({ id, filter, options, format = "date", rangeOptionLabel = DEFAULT_RANGE_OPTION_LABEL, rangeOptionStartLabel = DEFAULT_RANGE_OPTION_START_LABEL, rangeOptionEndLabel = DEFAULT_RANGE_OPTION_END_LABEL, disableRangeOption = false, isCustomRange, onUpdate, }) => {
    const currentValue = filter;
    const { instance } = useDataTableContext();
    const [isCustom, setIsCustom] = React.useState(isCustomRange);
    // Sync isCustom state when isCustomRange changes
    React.useEffect(() => {
        setIsCustom(isCustomRange);
    }, [isCustomRange]);
    const selectedValue = React.useMemo(() => {
        if (!currentValue || isCustom) {
            return undefined;
        }
        return JSON.stringify(currentValue);
    }, [currentValue, isCustom]);
    const onValueChange = React.useCallback((valueStr) => {
        setIsCustom(false);
        const value = JSON.parse(valueStr);
        if (onUpdate) {
            onUpdate(value);
        }
        else {
            instance.updateFilter({ id, value });
        }
    }, [instance, id, onUpdate]);
    const onSelectCustom = React.useCallback(() => {
        setIsCustom(true);
        // Don't clear the value when selecting custom - keep the current value
    }, []);
    const onCustomValueChange = React.useCallback((input, value) => {
        const newCurrentValue = { ...currentValue };
        newCurrentValue[input] = value ? value.toISOString() : undefined;
        if (onUpdate) {
            onUpdate(newCurrentValue);
        }
        else {
            instance.updateFilter({ id, value: newCurrentValue });
        }
    }, [instance, id, currentValue, onUpdate]);
    const { focusedIndex, setFocusedIndex } = useKeyboardNavigation(options, (index) => {
        if (index === options.length && !disableRangeOption) {
            onSelectCustom();
        }
        else {
            onValueChange(JSON.stringify(options[index].value));
        }
    }, disableRangeOption ? 0 : 1);
    const granularity = format === "date-time" ? "minute" : "day";
    const maxDate = (currentValue === null || currentValue === void 0 ? void 0 : currentValue.$lte)
        ? granularity === "minute"
            ? new Date(currentValue.$lte)
            : new Date(new Date(currentValue.$lte).setHours(23, 59, 59, 999))
        : undefined;
    const minDate = (currentValue === null || currentValue === void 0 ? void 0 : currentValue.$gte)
        ? granularity === "minute"
            ? new Date(currentValue.$gte)
            : new Date(new Date(currentValue.$gte).setHours(0, 0, 0, 0))
        : undefined;
    const initialFocusedIndex = isCustom ? options.length : 0;
    const onListFocus = React.useCallback(() => {
        if (focusedIndex === -1) {
            setFocusedIndex(initialFocusedIndex);
        }
    }, [focusedIndex, initialFocusedIndex]);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "flex flex-col p-1 outline-none", tabIndex: 0, role: "list", onFocus: onListFocus, autoFocus: true },
            options.map((option, idx) => {
                const value = JSON.stringify(option.value);
                const isSelected = selectedValue === value;
                return (React.createElement(OptionButton, { key: idx, index: idx, option: option, isSelected: isSelected, isFocused: focusedIndex === idx, onClick: () => onValueChange(value), onMouseEvent: setFocusedIndex, icon: EllipseMiniSolid }));
            }),
            !disableRangeOption && (React.createElement(OptionButton, { index: options.length, option: {
                    label: rangeOptionLabel,
                    value: "__custom",
                }, icon: EllipseMiniSolid, isSelected: isCustom, isFocused: focusedIndex === options.length, onClick: onSelectCustom, onMouseEvent: setFocusedIndex }))),
        !disableRangeOption && isCustom && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "flex flex-col py-[3px]" },
                React.createElement("div", { className: "bg-ui-border-menu-top h-px w-full" }),
                React.createElement("div", { className: "bg-ui-border-menu-bot h-px w-full" })),
            React.createElement("div", { className: "flex flex-col gap-2 px-2 pb-3 pt-1" },
                React.createElement("div", { className: "flex flex-col gap-1" },
                    React.createElement(Label, { id: "custom-start-date-label", size: "xsmall", weight: "plus" }, rangeOptionStartLabel),
                    React.createElement(DatePicker, { "aria-labelledby": "custom-start-date-label", granularity: granularity, maxValue: maxDate, value: (currentValue === null || currentValue === void 0 ? void 0 : currentValue.$gte) ? new Date(currentValue.$gte) : null, onChange: (value) => onCustomValueChange("$gte", value) })),
                React.createElement("div", { className: "flex flex-col gap-1" },
                    React.createElement(Label, { id: "custom-end-date-label", size: "xsmall", weight: "plus" }, rangeOptionEndLabel),
                    React.createElement(DatePicker, { "aria-labelledby": "custom-end-date-label", granularity: granularity, minValue: minDate, value: (currentValue === null || currentValue === void 0 ? void 0 : currentValue.$lte) ? new Date(currentValue.$lte) : null, onChange: (value) => onCustomValueChange("$lte", value) })))))));
};
const DataTableFilterSelectContent = ({ id, filter = [], options, isNew = false, onUpdate, }) => {
    const { instance } = useDataTableContext();
    const [search, setSearch] = React.useState("");
    const filteredOptions = React.useMemo(() => {
        if (!search)
            return options;
        const searchLower = search.toLowerCase();
        return options.filter(opt => opt.label.toLowerCase().includes(searchLower));
    }, [options, search]);
    const onValueChange = React.useCallback((value) => {
        if (filter === null || filter === void 0 ? void 0 : filter.includes(value)) {
            const newValues = filter === null || filter === void 0 ? void 0 : filter.filter((v) => v !== value);
            const newValue = newValues.length > 0 ? newValues : undefined;
            if (onUpdate) {
                onUpdate(newValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: newValue,
                });
            }
        }
        else {
            const newValue = [...(filter !== null && filter !== void 0 ? filter : []), value];
            if (onUpdate) {
                onUpdate(newValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: newValue,
                });
            }
        }
    }, [instance, id, filter, onUpdate]);
    return (React.createElement("div", { className: "w-[250px]" },
        React.createElement("div", { className: "flex items-center gap-x-2 border-b px-3 py-1.5" },
            React.createElement(MagnifyingGlass, { className: "h-4 w-4 text-ui-fg-muted" }),
            React.createElement("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search...", className: "h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-ui-fg-muted", autoFocus: true }),
            search && (React.createElement("button", { onClick: () => setSearch(""), className: "text-ui-fg-muted hover:text-ui-fg-subtle" },
                React.createElement(XMarkMini, { className: "h-4 w-4" })))),
        React.createElement("div", { className: "max-h-[300px] overflow-auto p-1" },
            filteredOptions.length === 0 && (React.createElement("div", { className: "py-6 text-center text-sm text-ui-fg-muted" }, "No results found")),
            filteredOptions.map(option => {
                const isSelected = filter === null || filter === void 0 ? void 0 : filter.includes(option.value);
                return (React.createElement("button", { key: String(option.value), onClick: () => onValueChange(option.value), className: clx("flex w-full cursor-pointer items-center gap-x-2 rounded-md px-2 py-1.5 text-sm text-left", "hover:bg-ui-bg-base-hover") },
                    React.createElement("div", { className: "flex size-[15px] items-center justify-center" }, isSelected && React.createElement(CheckMini, null)),
                    React.createElement("span", null, option.label)));
            }))));
};
const DataTableFilterRadioContent = ({ id, filter, options, onUpdate, }) => {
    const { instance } = useDataTableContext();
    const onValueChange = React.useCallback((value) => {
        if (onUpdate) {
            onUpdate(value);
        }
        else {
            instance.updateFilter({ id, value });
        }
    }, [instance, id, onUpdate]);
    const { focusedIndex, setFocusedIndex } = useKeyboardNavigation(options, (index) => onValueChange(options[index].value));
    const onListFocus = React.useCallback(() => {
        if (focusedIndex === -1) {
            setFocusedIndex(0);
        }
    }, [focusedIndex]);
    return (React.createElement("div", { className: "flex flex-col p-1 outline-none", role: "list", tabIndex: 0, onFocus: onListFocus, autoFocus: true }, options.map((option, idx) => {
        const isSelected = filter === option.value;
        return (React.createElement(OptionButton, { key: idx, index: idx, option: option, isSelected: isSelected, isFocused: focusedIndex === idx, onClick: () => onValueChange(option.value), onMouseEvent: setFocusedIndex, icon: EllipseMiniSolid }));
    })));
};
function isDateFilterProps(props) {
    if (!props) {
        return false;
    }
    return props.type === "date";
}
function isMultiselectFilterProps(props) {
    if (!props) {
        return false;
    }
    return props.type === "multiselect";
}
function isStringFilterProps(props) {
    if (!props) {
        return false;
    }
    return props.type === "string";
}
function isNumberFilterProps(props) {
    if (!props) {
        return false;
    }
    return props.type === "number";
}
function isCustomFilterProps(props) {
    if (!props) {
        return false;
    }
    return props.type === "custom";
}
const OptionButton = React.memo(({ index, option, isSelected, isFocused, onClick, onMouseEvent, icon: Icon, }) => (React.createElement("button", { type: "button", role: "listitem", className: clx("bg-ui-bg-component txt-compact-small transition-fg flex items-center gap-2 rounded px-2 py-1 outline-none", { "bg-ui-bg-component-hover": isFocused }), onClick: onClick, onMouseEnter: () => onMouseEvent(index), onMouseLeave: () => onMouseEvent(-1), tabIndex: -1 },
    React.createElement("div", { className: "flex size-[15px] items-center justify-center" }, isSelected && React.createElement(Icon, null)),
    React.createElement("span", null, option.label))));
function useKeyboardNavigation(options, onSelect, extraItems = 0) {
    const [focusedIndex, setFocusedIndex] = React.useState(-1);
    const onKeyDown = React.useCallback((e) => {
        const totalLength = options.length + extraItems;
        if (document.activeElement.contentEditable === "true") {
            return;
        }
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setFocusedIndex((prev) => (prev < totalLength - 1 ? prev + 1 : prev));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
                break;
            case " ":
            case "Enter":
                e.preventDefault();
                if (focusedIndex >= 0) {
                    onSelect(focusedIndex);
                }
                break;
        }
    }, [options.length, extraItems, focusedIndex, onSelect]);
    React.useEffect(() => {
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onKeyDown]);
    return { focusedIndex, setFocusedIndex };
}
const DataTableFilterMultiselectContent = ({ id, filter = [], options, searchable = true, onUpdate, }) => {
    const { instance } = useDataTableContext();
    const [search, setSearch] = React.useState("");
    const filteredOptions = React.useMemo(() => {
        if (!searchable || !search)
            return options;
        const searchLower = search.toLowerCase();
        return options.filter(opt => opt.label.toLowerCase().includes(searchLower));
    }, [options, search, searchable]);
    const onValueChange = React.useCallback((value) => {
        if (filter === null || filter === void 0 ? void 0 : filter.includes(value)) {
            const newValues = filter === null || filter === void 0 ? void 0 : filter.filter((v) => v !== value);
            const newValue = newValues.length > 0 ? newValues : undefined;
            if (onUpdate) {
                onUpdate(newValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: newValue,
                });
            }
        }
        else {
            const newValue = [...(filter !== null && filter !== void 0 ? filter : []), value];
            if (onUpdate) {
                onUpdate(newValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: newValue,
                });
            }
        }
    }, [instance, id, filter, onUpdate]);
    if (!searchable) {
        return (React.createElement("div", { className: "w-[250px]" },
            React.createElement("div", { className: "max-h-[300px] overflow-auto p-1" }, options.map(option => {
                const isSelected = filter === null || filter === void 0 ? void 0 : filter.includes(option.value);
                return (React.createElement("button", { key: String(option.value), onClick: () => onValueChange(option.value), className: clx("flex w-full items-center gap-x-2 rounded-md px-2 py-1.5 text-sm", "hover:bg-ui-bg-base-hover cursor-pointer text-left") },
                    React.createElement(Checkbox, { checked: isSelected, className: "pointer-events-none" }),
                    React.createElement("span", null, option.label)));
            }))));
    }
    return (React.createElement("div", { className: "w-[250px]" },
        React.createElement("div", { className: "flex items-center gap-x-2 border-b px-3 py-1.5" },
            React.createElement(MagnifyingGlass, { className: "h-4 w-4 text-ui-fg-muted" }),
            React.createElement("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search...", className: "h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-ui-fg-muted", autoFocus: true }),
            search && (React.createElement("button", { onClick: () => setSearch(""), className: "text-ui-fg-muted hover:text-ui-fg-subtle" },
                React.createElement(XMarkMini, { className: "h-4 w-4" })))),
        React.createElement("div", { className: "max-h-[300px] overflow-auto p-1" },
            filteredOptions.length === 0 && (React.createElement("div", { className: "py-6 text-center text-sm text-ui-fg-muted" }, "No results found")),
            filteredOptions.map(option => {
                const isSelected = filter === null || filter === void 0 ? void 0 : filter.includes(option.value);
                return (React.createElement("button", { key: String(option.value), onClick: () => onValueChange(option.value), className: clx("flex w-full cursor-pointer items-center gap-x-2 rounded-md px-2 py-1.5 text-sm text-left", "hover:bg-ui-bg-base-hover") },
                    React.createElement(Checkbox, { checked: isSelected, className: "pointer-events-none" }),
                    React.createElement("span", null, option.label)));
            }))));
};
const DataTableFilterStringContent = ({ id, filter, placeholder = "Enter value...", onUpdate, }) => {
    const { instance } = useDataTableContext();
    const [value, setValue] = React.useState(filter || "");
    const timeoutRef = React.useRef(null);
    const handleChange = React.useCallback((newValue) => {
        setValue(newValue);
        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        // Debounce the update
        timeoutRef.current = setTimeout(() => {
            const updateValue = newValue.trim() || undefined;
            if (onUpdate) {
                onUpdate(updateValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: updateValue,
                });
            }
        }, 500);
    }, [instance, id, onUpdate]);
    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);
    const handleKeyDown = React.useCallback((e) => {
        if (e.key === "Enter") {
            // Clear timeout and apply immediately
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            const updateValue = value.trim() || undefined;
            if (onUpdate) {
                onUpdate(updateValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: updateValue,
                });
            }
        }
    }, [instance, id, value, onUpdate]);
    return (React.createElement("div", { className: "p-3 w-[250px]" },
        React.createElement(Input, { placeholder: placeholder, value: value, onChange: (e) => handleChange(e.target.value), onKeyDown: handleKeyDown, autoFocus: true })));
};
const DataTableFilterNumberContent = ({ id, filter, placeholder = "Enter number...", includeOperators = true, onUpdate, }) => {
    const { instance } = useDataTableContext();
    const [operator, setOperator] = React.useState("eq");
    const [value, setValue] = React.useState("");
    const timeoutRef = React.useRef(null);
    React.useEffect(() => {
        if (filter) {
            if (typeof filter === "number") {
                setOperator("eq");
                setValue(String(filter));
            }
            else if (typeof filter === "object") {
                const op = Object.keys(filter)[0];
                setOperator(op.replace("$", ""));
                setValue(String(filter[op]));
            }
        }
    }, [filter]);
    const handleValueChange = React.useCallback((newValue) => {
        setValue(newValue);
        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        // Debounce the update
        timeoutRef.current = setTimeout(() => {
            const num = parseFloat(newValue);
            if (!isNaN(num)) {
                const filterValue = includeOperators && operator !== "eq"
                    ? { [`$${operator}`]: num }
                    : num;
                if (onUpdate) {
                    onUpdate(filterValue);
                }
                else {
                    instance.updateFilter({
                        id,
                        value: filterValue,
                    });
                }
            }
            else if (newValue === "") {
                if (onUpdate) {
                    onUpdate(undefined);
                }
                else {
                    instance.updateFilter({
                        id,
                        value: undefined,
                    });
                }
            }
        }, 500);
    }, [instance, id, operator, includeOperators, onUpdate]);
    const handleOperatorChange = React.useCallback((newOperator) => {
        setOperator(newOperator);
        // If we have a value, update immediately with new operator
        const num = parseFloat(value);
        if (!isNaN(num)) {
            const filterValue = includeOperators && newOperator !== "eq"
                ? { [`$${newOperator}`]: num }
                : num;
            if (onUpdate) {
                onUpdate(filterValue);
            }
            else {
                instance.updateFilter({
                    id,
                    value: filterValue,
                });
            }
        }
    }, [instance, id, value, includeOperators, onUpdate]);
    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);
    const handleKeyDown = React.useCallback((e) => {
        if (e.key === "Enter") {
            // Clear timeout and apply immediately
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            const num = parseFloat(value);
            if (!isNaN(num)) {
                const filterValue = includeOperators && operator !== "eq"
                    ? { [`$${operator}`]: num }
                    : num;
                if (onUpdate) {
                    onUpdate(filterValue);
                }
                else {
                    instance.updateFilter({
                        id,
                        value: filterValue,
                    });
                }
            }
        }
    }, [instance, id, value, operator, includeOperators, onUpdate]);
    const operators = [
        { value: "eq", label: "Equals" },
        { value: "gt", label: "Greater than" },
        { value: "gte", label: "Greater than or equal" },
        { value: "lt", label: "Less than" },
        { value: "lte", label: "Less than or equal" },
    ];
    return (React.createElement("div", { className: "p-3 space-y-3 w-[250px]" },
        includeOperators && (React.createElement(Select, { value: operator, onValueChange: handleOperatorChange },
            React.createElement(Select.Trigger, null,
                React.createElement(Select.Value, null)),
            React.createElement(Select.Content, null, operators.map(op => (React.createElement(Select.Item, { key: op.value, value: op.value }, op.label)))))),
        React.createElement(Input, { type: "number", placeholder: placeholder, value: value, onChange: (e) => handleValueChange(e.target.value), onKeyDown: handleKeyDown, autoFocus: !includeOperators })));
};
const DataTableFilterCustomContent = ({ id, filter, onRemove, render, onUpdate, }) => {
    const { instance } = useDataTableContext();
    const handleChange = React.useCallback((value) => {
        if (onUpdate) {
            onUpdate(value);
        }
        else {
            instance.updateFilter({
                id,
                value,
            });
        }
    }, [instance, id, onUpdate]);
    return (React.createElement(React.Fragment, null, render({
        value: filter,
        onChange: handleChange,
        onRemove,
    })));
};
export { DataTableFilter };
//# sourceMappingURL=data-table-filter.js.map