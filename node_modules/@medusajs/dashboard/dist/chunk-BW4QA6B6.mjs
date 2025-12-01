import {
  countries
} from "./chunk-DG7J63J2.mjs";

// src/components/inputs/country-select/country-select.tsx
import {
  forwardRef,
  useImperativeHandle,
  useRef
} from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@medusajs/ui";
import { jsx, jsxs } from "react/jsx-runtime";
var CountrySelect = forwardRef(({ disabled, placeholder, defaultValue, onChange, ...field }, ref) => {
  const { t } = useTranslation();
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current);
  return /* @__PURE__ */ jsx("div", { className: "relative", children: /* @__PURE__ */ jsxs(
    Select,
    {
      ...field,
      value: field.value ? field.value?.toLowerCase() : void 0,
      onValueChange: onChange,
      defaultValue: defaultValue ? defaultValue.toLowerCase() : void 0,
      disabled,
      children: [
        /* @__PURE__ */ jsx(Select.Trigger, { ref: innerRef, className: "w-full", children: /* @__PURE__ */ jsx(
          Select.Value,
          {
            placeholder: placeholder || t("fields.selectCountry")
          }
        ) }),
        /* @__PURE__ */ jsx(Select.Content, { children: countries.map((country) => /* @__PURE__ */ jsx(
          Select.Item,
          {
            value: country.iso_2.toLowerCase(),
            children: country.display_name
          },
          country.iso_2
        )) })
      ]
    }
  ) });
});
CountrySelect.displayName = "CountrySelect";

export {
  CountrySelect
};
