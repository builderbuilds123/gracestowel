import {
  MoneyAmountCell
} from "./chunk-INE2QCSC.mjs";
import {
  PlaceholderCell
} from "./chunk-P3UUX2T6.mjs";

// src/components/table/table-cells/order/display-id-cell/display-id-cell.tsx
import { useTranslation } from "react-i18next";
import { jsx, jsxs } from "react/jsx-runtime";
var DisplayIdCell = ({ displayId }) => {
  if (!displayId) {
    return /* @__PURE__ */ jsx(PlaceholderCell, {});
  }
  return /* @__PURE__ */ jsx("div", { className: "text-ui-fg-subtle txt-compact-small flex h-full w-full items-center overflow-hidden", children: /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
    "#",
    displayId
  ] }) });
};
var DisplayIdHeader = () => {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsx("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx("span", { className: "truncate", children: t("fields.order") }) });
};

// src/components/table/table-cells/order/total-cell/total-cell.tsx
import { useTranslation as useTranslation2 } from "react-i18next";
import { jsx as jsx2 } from "react/jsx-runtime";
var TotalCell = ({ currencyCode, total }) => {
  if (!total) {
    return /* @__PURE__ */ jsx2(PlaceholderCell, {});
  }
  return /* @__PURE__ */ jsx2(MoneyAmountCell, { currencyCode, amount: total, align: "right" });
};
var TotalHeader = () => {
  const { t } = useTranslation2();
  return /* @__PURE__ */ jsx2("div", { className: "flex h-full w-full items-center justify-end", children: /* @__PURE__ */ jsx2("span", { className: "truncate", children: t("fields.total") }) });
};

export {
  DisplayIdCell,
  DisplayIdHeader,
  TotalCell,
  TotalHeader
};
