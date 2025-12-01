"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Toaster = void 0;
const tslib_1 = require("tslib");
const React = tslib_1.__importStar(require("react"));
const sonner_1 = require("sonner");
const clx_1 = require("../../utils/clx");
/**
 * This component is based on the [Toaster component of the Sonner library](https://sonner.emilkowal.ski/toaster).
 */
const Toaster = ({ 
/**
 * The position of the created toasts.
 */
position = "bottom-right", 
/**
 * The gap between the toast components.
 */
gap = 12, 
/**
 * The space from the edges of the screen.
 */
offset = 24, 
/**
 * The time in milliseconds that a toast is shown before it's
 * automatically dismissed.
 *
 * @defaultValue 4000
 */
duration, ...props }) => {
    const primitiveProps = {
        ...props,
        position,
        gap,
        offset,
        cn: clx_1.clx,
        toastOptions: {
            duration,
        },
    };
    return React.createElement(sonner_1.Toaster, { ...primitiveProps });
};
exports.Toaster = Toaster;
//# sourceMappingURL=toaster.js.map