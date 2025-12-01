"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooltipProvider = exports.Tooltip = void 0;
const tslib_1 = require("tslib");
const radix_ui_1 = require("radix-ui");
const React = tslib_1.__importStar(require("react"));
const clx_1 = require("../../utils/clx");
/**
 * This component is based on the [Radix UI Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) primitive.
 *
 * @excludeExternal
 */
const Tooltip = ({ 
/**
 * The element to trigger the tooltip.
 *
 * @keep
 */
children, 
/**
 * The content to display in the tooltip.
 */
content, 
/**
 * Whether the tooltip is currently open.
 *
 * @keep
 */
open, 
/**
 * Whether the tooltip is open by default.
 *
 * @keep
 */
defaultOpen, 
/**
 * A function that is called when the tooltip's open state changes.
 *
 * @keep
 */
onOpenChange, 
/**
 * The time in milliseconds to delay the tooltip's appearance.
 *
 * @keep
 */
delayDuration, 
/**
 * The maximum width of the tooltip.
 */
maxWidth = 220, className, 
/**
 * The side to position the tooltip.
 *
 * @defaultValue top
 */
side, 
/**
 * The distance in pixels between the tooltip and its trigger.
 *
 * @keep
 */
sideOffset = 8, 
/**
 * A function that is triggered when the tooltip is clicked.
 */
onClick, ...props }) => {
    return (React.createElement(radix_ui_1.Tooltip.Root, { open: open, defaultOpen: defaultOpen, onOpenChange: onOpenChange, delayDuration: delayDuration },
        React.createElement(radix_ui_1.Tooltip.Trigger, { onClick: onClick, asChild: true }, children),
        React.createElement(radix_ui_1.Tooltip.Portal, null,
            React.createElement(radix_ui_1.Tooltip.Content, { side: side, sideOffset: sideOffset, align: "center", className: (0, clx_1.clx)("txt-compact-xsmall text-ui-fg-subtle bg-ui-bg-base shadow-elevation-tooltip rounded-lg px-2.5 py-1", "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className), ...props, style: { ...props.style, maxWidth } }, content))));
};
exports.Tooltip = Tooltip;
const TooltipProvider = ({ children, delayDuration = 100, skipDelayDuration = 300, ...props }) => {
    return (React.createElement(radix_ui_1.Tooltip.TooltipProvider, { delayDuration: delayDuration, skipDelayDuration: skipDelayDuration, ...props }, children));
};
exports.TooltipProvider = TooltipProvider;
//# sourceMappingURL=tooltip.js.map