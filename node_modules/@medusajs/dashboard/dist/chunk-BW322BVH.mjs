import {
  CollectionCell,
  CollectionHeader,
  ProductStatusCell,
  ProductStatusHeader,
  SalesChannelHeader,
  SalesChannelsCell,
  VariantCell,
  VariantHeader
} from "./chunk-XLDQPLK4.mjs";
import {
  ProductCell,
  ProductHeader
} from "./chunk-IQBAUTU5.mjs";

// src/hooks/table/columns/use-product-table-columns.tsx
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { jsx } from "react/jsx-runtime";
var columnHelper = createColumnHelper();
var useProductTableColumns = () => {
  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => /* @__PURE__ */ jsx(ProductHeader, {}),
        cell: ({ row }) => /* @__PURE__ */ jsx(ProductCell, { product: row.original })
      }),
      columnHelper.accessor("collection", {
        header: () => /* @__PURE__ */ jsx(CollectionHeader, {}),
        cell: ({ row }) => /* @__PURE__ */ jsx(CollectionCell, { collection: row.original.collection })
      }),
      columnHelper.accessor("sales_channels", {
        header: () => /* @__PURE__ */ jsx(SalesChannelHeader, {}),
        cell: ({ row }) => /* @__PURE__ */ jsx(SalesChannelsCell, { salesChannels: row.original.sales_channels })
      }),
      columnHelper.accessor("variants", {
        header: () => /* @__PURE__ */ jsx(VariantHeader, {}),
        cell: ({ row }) => /* @__PURE__ */ jsx(VariantCell, { variants: row.original.variants })
      }),
      columnHelper.accessor("status", {
        header: () => /* @__PURE__ */ jsx(ProductStatusHeader, {}),
        cell: ({ row }) => /* @__PURE__ */ jsx(ProductStatusCell, { status: row.original.status })
      })
    ],
    []
  );
};

export {
  useProductTableColumns
};
