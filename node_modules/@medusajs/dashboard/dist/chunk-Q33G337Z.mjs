import {
  useDate
} from "./chunk-PFKKVLZX.mjs";

// src/components/data-table/helpers/general/use-data-table-date-filters.tsx
import { createDataTableFilterHelper } from "@medusajs/ui";
import { subDays, subMonths } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
var filterHelper = createDataTableFilterHelper();
var useDateFilterOptions = () => {
  const { t } = useTranslation();
  const today = useMemo(() => {
    const date = /* @__PURE__ */ new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  return useMemo(() => {
    return [
      {
        label: t("filters.date.today"),
        value: {
          $gte: today.toISOString()
        }
      },
      {
        label: t("filters.date.lastSevenDays"),
        value: {
          $gte: subDays(today, 7).toISOString()
          // 7 days ago
        }
      },
      {
        label: t("filters.date.lastThirtyDays"),
        value: {
          $gte: subDays(today, 30).toISOString()
          // 30 days ago
        }
      },
      {
        label: t("filters.date.lastNinetyDays"),
        value: {
          $gte: subDays(today, 90).toISOString()
          // 90 days ago
        }
      },
      {
        label: t("filters.date.lastTwelveMonths"),
        value: {
          $gte: subMonths(today, 12).toISOString()
          // 12 months ago
        }
      }
    ];
  }, [today, t]);
};
var useDataTableDateFilters = (disableRangeOption) => {
  const { t } = useTranslation();
  const { getFullDate } = useDate();
  const dateFilterOptions = useDateFilterOptions();
  const rangeOptions = useMemo(() => {
    if (disableRangeOption) {
      return {
        disableRangeOption: true
      };
    }
    return {
      rangeOptionStartLabel: t("filters.date.starting"),
      rangeOptionEndLabel: t("filters.date.ending"),
      rangeOptionLabel: t("filters.date.custom"),
      options: dateFilterOptions
    };
  }, [disableRangeOption, t, dateFilterOptions]);
  return useMemo(() => {
    return [
      filterHelper.accessor("created_at", {
        type: "date",
        label: t("fields.createdAt"),
        format: "date",
        formatDateValue: (date) => getFullDate({ date }),
        options: dateFilterOptions,
        ...rangeOptions
      }),
      filterHelper.accessor("updated_at", {
        type: "date",
        label: t("fields.updatedAt"),
        format: "date",
        formatDateValue: (date) => getFullDate({ date }),
        options: dateFilterOptions,
        ...rangeOptions
      })
    ];
  }, [t, dateFilterOptions, getFullDate, rangeOptions]);
};

export {
  useDataTableDateFilters
};
