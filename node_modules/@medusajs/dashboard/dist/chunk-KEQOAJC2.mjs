// src/components/inputs/percentage-input/percentage-input.tsx
import { clx, Input, Text } from "@medusajs/ui";

// src/lib/number-helper.ts
function getNumberOfDecimalPlaces(num) {
  const str = num.toString();
  if (str.indexOf(".") === -1) {
    return 0;
  }
  return str.split(".")[1].length;
}

// src/components/inputs/percentage-input/percentage-input.tsx
import { forwardRef } from "react";
import Primitive from "react-currency-input-field";
import { jsx, jsxs } from "react/jsx-runtime";
var MIN_DECIMAL_SCALE = 2;
function resolveDecimalScale(value) {
  if (value == null || Array.isArray(value)) {
    return MIN_DECIMAL_SCALE;
  }
  return Math.max(
    getNumberOfDecimalPlaces(parseFloat(value.toString())),
    MIN_DECIMAL_SCALE
  );
}
var DeprecatedPercentageInput = forwardRef(({ min = 0, max = 100, step = 1e-4, ...props }, ref) => {
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsx("div", { className: "absolute inset-y-0 left-0 z-10 flex w-8 items-center justify-center border-r", children: /* @__PURE__ */ jsx(
      Text,
      {
        className: "text-ui-fg-muted",
        size: "small",
        leading: "compact",
        weight: "plus",
        children: "%"
      }
    ) }),
    /* @__PURE__ */ jsx(
      Input,
      {
        ref,
        type: "number",
        min,
        max,
        step,
        ...props,
        className: "pl-10"
      }
    )
  ] });
});
DeprecatedPercentageInput.displayName = "PercentageInput";
var PercentageInput = forwardRef(
  ({
    min = 0,
    max = 100,
    decimalScale,
    decimalsLimit,
    value,
    className,
    ...props
  }, ref) => {
    const resolvedDecimalScale = decimalScale ?? resolveDecimalScale(value);
    const resolvedDecimalsLimit = decimalsLimit ?? resolvedDecimalScale;
    return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx(
        Primitive,
        {
          ref,
          min,
          max,
          autoComplete: "off",
          decimalScale: resolvedDecimalScale,
          decimalsLimit: resolvedDecimalsLimit,
          value,
          ...props,
          className: clx(
            "caret-ui-fg-base bg-ui-bg-field shadow-buttons-neutral transition-fg txt-compact-small flex w-full select-none appearance-none items-center justify-between rounded-md px-2 py-1.5 pl-10 text-left outline-none",
            "placeholder:text-ui-fg-muted text-ui-fg-base",
            "hover:bg-ui-bg-field-hover",
            "focus-visible:shadow-borders-interactive-with-active data-[state=open]:!shadow-borders-interactive-with-active",
            "aria-[invalid=true]:border-ui-border-error aria-[invalid=true]:shadow-borders-error",
            "invalid::border-ui-border-error invalid:shadow-borders-error",
            "disabled:!bg-ui-bg-disabled disabled:!text-ui-fg-disabled",
            className
          )
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-y-0 left-0 z-10 flex w-8 items-center justify-center border-r", children: /* @__PURE__ */ jsx(
        Text,
        {
          className: "text-ui-fg-muted",
          size: "small",
          leading: "compact",
          weight: "plus",
          children: "%"
        }
      ) })
    ] });
  }
);
PercentageInput.displayName = "PercentageInput";

export {
  DeprecatedPercentageInput,
  PercentageInput
};
