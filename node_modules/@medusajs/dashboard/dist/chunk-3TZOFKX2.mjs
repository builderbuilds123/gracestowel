// src/hooks/use-combobox-data.tsx
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery
} from "@tanstack/react-query";

// src/hooks/use-debounced-search.tsx
import debounce from "lodash.debounce";
import { useCallback, useEffect, useState } from "react";
var useDebouncedSearch = () => {
  const [searchValue, onSearchValueChange] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debouncedUpdate = useCallback(
    debounce((query) => setDebouncedQuery(query), 300),
    []
  );
  useEffect(() => {
    debouncedUpdate(searchValue);
    return () => debouncedUpdate.cancel();
  }, [searchValue, debouncedUpdate]);
  return {
    searchValue,
    onSearchValueChange,
    query: debouncedQuery || void 0
  };
};

// src/hooks/use-combobox-data.tsx
var useComboboxData = ({
  queryKey,
  queryFn,
  getOptions,
  defaultValue,
  defaultValueKey,
  selectedValue,
  pageSize = 10,
  enabled = true
}) => {
  const { searchValue, onSearchValueChange, query } = useDebouncedSearch();
  const queryInitialDataBy = defaultValueKey || "id";
  const { data: initialData } = useQuery({
    queryKey: [...queryKey, defaultValue].filter(Boolean),
    queryFn: async () => {
      return queryFn({
        [queryInitialDataBy]: defaultValue,
        limit: Array.isArray(defaultValue) ? defaultValue.length : 1
      });
    },
    enabled: !!defaultValue && enabled
  });
  const { data: selectedData } = useQuery({
    queryKey: [...queryKey, selectedValue].filter(Boolean),
    queryFn: async () => {
      return queryFn({
        id: selectedValue,
        limit: 1
      });
    },
    enabled: !!selectedValue && enabled
  });
  const { data, ...rest } = useInfiniteQuery({
    // prevent infinite query response shape beeing stored under regualr list reponse QKs
    queryKey: [...queryKey, "_cbx_", query].filter(Boolean),
    queryFn: async ({ pageParam = 0 }) => {
      return await queryFn({
        q: query,
        limit: pageSize,
        offset: pageParam
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const moreItemsExist = lastPage.count > lastPage.offset + lastPage.limit;
      return moreItemsExist ? lastPage.offset + lastPage.limit : void 0;
    },
    placeholderData: keepPreviousData,
    enabled
  });
  const options = data?.pages.flatMap((page) => getOptions(page)) ?? [];
  const defaultOptions = initialData ? getOptions(initialData) : [];
  const selectedOptions = selectedData ? getOptions(selectedData) : [];
  const disabled = !rest.isPending && !options.length && !searchValue || !enabled;
  if (defaultValue && defaultOptions.length && !searchValue) {
    defaultOptions.forEach((option) => {
      if (!options.find((o) => o.value === option.value)) {
        options.unshift(option);
      }
    });
  }
  if (selectedValue && selectedOptions.length) {
    selectedOptions.forEach((option) => {
      if (!options.find((o) => o.value === option.value)) {
        options.unshift(option);
      }
    });
  }
  return {
    options,
    searchValue,
    onSearchValueChange,
    disabled,
    ...rest
  };
};

export {
  useDebouncedSearch,
  useComboboxData
};
