import {
  SectionRow
} from "./chunk-LFLGEXIG.mjs";
import {
  ActionMenu
} from "./chunk-OZPB6JBL.mjs";

// src/routes/inventory/inventory-detail/components/inventory-item-general-section.tsx
import { Container, Heading } from "@medusajs/ui";
import { PencilSquare } from "@medusajs/icons";
import { useTranslation } from "react-i18next";
import { jsx, jsxs } from "react/jsx-runtime";
var InventoryItemGeneralSection = ({
  inventoryItem
}) => {
  const { t } = useTranslation();
  const getQuantityFormat = (quantity) => {
    if (quantity !== void 0 && !isNaN(quantity)) {
      return t("inventory.quantityAcrossLocations", {
        quantity,
        locations: inventoryItem.location_levels?.length
      });
    }
    return "-";
  };
  return /* @__PURE__ */ jsxs(Container, { className: "divide-y p-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-6 py-4", children: [
      /* @__PURE__ */ jsxs(Heading, { children: [
        inventoryItem.title ?? inventoryItem.sku,
        " ",
        t("fields.details")
      ] }),
      /* @__PURE__ */ jsx(
        ActionMenu,
        {
          groups: [
            {
              actions: [
                {
                  icon: /* @__PURE__ */ jsx(PencilSquare, {}),
                  label: t("actions.edit"),
                  to: "edit"
                }
              ]
            }
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(SectionRow, { title: t("fields.sku"), value: inventoryItem.sku ?? "-" }),
    /* @__PURE__ */ jsx(
      SectionRow,
      {
        title: t("fields.inStock"),
        value: getQuantityFormat(inventoryItem.stocked_quantity)
      }
    ),
    /* @__PURE__ */ jsx(
      SectionRow,
      {
        title: t("inventory.reserved"),
        value: getQuantityFormat(inventoryItem.reserved_quantity)
      }
    ),
    /* @__PURE__ */ jsx(
      SectionRow,
      {
        title: t("inventory.available"),
        value: getQuantityFormat(
          inventoryItem.stocked_quantity - inventoryItem.reserved_quantity
        )
      }
    )
  ] });
};

export {
  InventoryItemGeneralSection
};
