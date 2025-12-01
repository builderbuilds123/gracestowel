import {
  useDateTableFilters
} from "./chunk-W7625H47.mjs";

// src/hooks/table/filters/use-collection-table-filters.tsx
var useCollectionTableFilters = () => {
  const dateFilters = useDateTableFilters();
  return dateFilters;
};

// src/hooks/table/filters/use-product-tag-table-filters.tsx
var useProductTagTableFilters = () => {
  const dateFilters = useDateTableFilters();
  return dateFilters;
};

// src/hooks/table/filters/use-shipping-option-table-filters.tsx
import { useTranslation } from "react-i18next";
var useShippingOptionTableFilters = (locations) => {
  const { t } = useTranslation();
  const locationFilter = {
    key: "stock_location_id",
    label: t("fields.location"),
    type: "select",
    options: locations.map((l) => ({ label: l.name, value: l.id }))
  };
  const dateFilters = [
    { label: t("fields.createdAt"), key: "created_at" },
    { label: t("fields.updatedAt"), key: "updated_at" }
  ].map((f) => ({
    key: f.key,
    label: f.label,
    type: "date"
  }));
  const filters = [locationFilter, ...dateFilters];
  return filters;
};

// src/hooks/table/filters/use-tax-rate-table-filters.tsx
import { useTranslation as useTranslation2 } from "react-i18next";

export {
  useCollectionTableFilters,
  useProductTagTableFilters,
  useShippingOptionTableFilters
};
