import {
  getOrderFulfillmentStatus,
  getOrderPaymentStatus
} from "./chunk-7DXVXBSA.mjs";
import {
  DisplayIdCell,
  DisplayIdHeader,
  TotalCell,
  TotalHeader
} from "./chunk-3I6G3NRU.mjs";
import {
  DateCell,
  DateHeader
} from "./chunk-SJ3E4T6B.mjs";
import {
  StatusCell
} from "./chunk-ADOCJB6L.mjs";
import {
  PlaceholderCell
} from "./chunk-P3UUX2T6.mjs";

// src/hooks/table/columns/use-order-table-columns.tsx
import {
  createColumnHelper
} from "@tanstack/react-table";
import { useMemo } from "react";

// src/components/table/table-cells/order/country-cell/country-cell.tsx
import { Tooltip } from "@medusajs/ui";
import ReactCountryFlag from "react-country-flag";
import { jsx } from "react/jsx-runtime";
var CountryCell = ({
  country
}) => {
  if (!country) {
    return /* @__PURE__ */ jsx(PlaceholderCell, {});
  }
  return /* @__PURE__ */ jsx("div", { className: "flex size-5 items-center justify-center", children: /* @__PURE__ */ jsx(Tooltip, { content: country.display_name, children: /* @__PURE__ */ jsx("div", { className: "flex size-4 items-center justify-center overflow-hidden rounded-sm", children: /* @__PURE__ */ jsx(
    ReactCountryFlag,
    {
      countryCode: country.iso_2.toUpperCase(),
      svg: true,
      style: {
        width: "16px",
        height: "16px"
      },
      "aria-label": country.display_name
    }
  ) }) }) });
};

// src/components/table/table-cells/order/customer-cell/customer-cell.tsx
import { useTranslation } from "react-i18next";
import { jsx as jsx2 } from "react/jsx-runtime";
var CustomerCell = ({
  customer
}) => {
  if (!customer) {
    return /* @__PURE__ */ jsx2("span", { className: "text-ui-fg-muted", children: "-" });
  }
  const { first_name, last_name, email } = customer;
  const name = [first_name, last_name].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsx2("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx2("span", { className: "truncate", children: name || email }) });
};
var CustomerHeader = () => {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsx2("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx2("span", { className: "truncate", children: t("fields.customer") }) });
};

// src/components/table/table-cells/order/fulfillment-status-cell/fulfillment-status-cell.tsx
import { useTranslation as useTranslation2 } from "react-i18next";
import { jsx as jsx3 } from "react/jsx-runtime";
var FulfillmentStatusCell = ({
  status
}) => {
  const { t } = useTranslation2();
  if (!status) {
    return "-";
  }
  const { label, color } = getOrderFulfillmentStatus(t, status);
  return /* @__PURE__ */ jsx3(StatusCell, { color, children: label });
};
var FulfillmentStatusHeader = () => {
  const { t } = useTranslation2();
  return /* @__PURE__ */ jsx3("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx3("span", { className: "truncate", children: t("fields.fulfillment") }) });
};

// src/components/table/table-cells/order/payment-status-cell/payment-status-cell.tsx
import { useTranslation as useTranslation3 } from "react-i18next";
import { jsx as jsx4 } from "react/jsx-runtime";
var PaymentStatusCell = ({ status }) => {
  const { t } = useTranslation3();
  const { label, color } = getOrderPaymentStatus(t, status);
  return /* @__PURE__ */ jsx4(StatusCell, { color, children: label });
};
var PaymentStatusHeader = () => {
  const { t } = useTranslation3();
  return /* @__PURE__ */ jsx4("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx4("span", { className: "truncate", children: t("fields.payment") }) });
};

// src/components/table/table-cells/order/sales-channel-cell/sales-channel-cell.tsx
import { useTranslation as useTranslation4 } from "react-i18next";
import { jsx as jsx5 } from "react/jsx-runtime";
var SalesChannelCell = ({
  channel
}) => {
  if (!channel) {
    return /* @__PURE__ */ jsx5("span", { className: "text-ui-fg-muted", children: "-" });
  }
  const { name } = channel;
  return /* @__PURE__ */ jsx5("div", { className: "flex h-full w-full items-center overflow-hidden", children: /* @__PURE__ */ jsx5("span", { className: "truncate", children: name }) });
};
var SalesChannelHeader = () => {
  const { t } = useTranslation4();
  return /* @__PURE__ */ jsx5("div", { className: "flex h-full w-full items-center", children: /* @__PURE__ */ jsx5("span", { className: "truncate", children: t("fields.salesChannel") }) });
};

// src/hooks/table/columns/use-order-table-columns.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
var columnHelper = createColumnHelper();
var useOrderTableColumns = (props) => {
  const { exclude = [] } = props ?? {};
  const columns = useMemo(
    () => [
      columnHelper.accessor("display_id", {
        header: () => /* @__PURE__ */ jsx6(DisplayIdHeader, {}),
        cell: ({ getValue }) => {
          const id = getValue();
          return /* @__PURE__ */ jsx6(DisplayIdCell, { displayId: id });
        }
      }),
      columnHelper.accessor("created_at", {
        header: () => /* @__PURE__ */ jsx6(DateHeader, {}),
        cell: ({ getValue }) => {
          const date = new Date(getValue());
          return /* @__PURE__ */ jsx6(DateCell, { date });
        }
      }),
      columnHelper.accessor("customer", {
        header: () => /* @__PURE__ */ jsx6(CustomerHeader, {}),
        cell: ({ getValue }) => {
          const customer = getValue();
          return /* @__PURE__ */ jsx6(CustomerCell, { customer });
        }
      }),
      columnHelper.accessor("sales_channel", {
        header: () => /* @__PURE__ */ jsx6(SalesChannelHeader, {}),
        cell: ({ getValue }) => {
          const channel = getValue();
          return /* @__PURE__ */ jsx6(SalesChannelCell, { channel });
        }
      }),
      columnHelper.accessor("payment_status", {
        header: () => /* @__PURE__ */ jsx6(PaymentStatusHeader, {}),
        cell: ({ getValue }) => {
          const status = getValue();
          return /* @__PURE__ */ jsx6(PaymentStatusCell, { status });
        }
      }),
      columnHelper.accessor("fulfillment_status", {
        header: () => /* @__PURE__ */ jsx6(FulfillmentStatusHeader, {}),
        cell: ({ getValue }) => {
          const status = getValue();
          return /* @__PURE__ */ jsx6(FulfillmentStatusCell, { status });
        }
      }),
      columnHelper.accessor("total", {
        header: () => /* @__PURE__ */ jsx6(TotalHeader, {}),
        cell: ({ getValue, row }) => {
          const total = getValue();
          const currencyCode = row.original.currency_code;
          return /* @__PURE__ */ jsx6(TotalCell, { currencyCode, total });
        }
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => {
          const country = row.original.shipping_address?.country;
          return /* @__PURE__ */ jsx6(CountryCell, { country });
        }
      })
    ],
    []
  );
  const isAccessorColumnDef = (c) => {
    return c.accessorKey !== void 0;
  };
  const isDisplayColumnDef = (c) => {
    return c.id !== void 0;
  };
  const shouldExclude = (c) => {
    if (isAccessorColumnDef(c)) {
      return exclude.includes(c.accessorKey);
    } else if (isDisplayColumnDef(c)) {
      return exclude.includes(c.id);
    }
    return false;
  };
  return columns.filter(
    (c) => !shouldExclude(c)
  );
};

export {
  useOrderTableColumns
};
