import {
  sdk
} from "./chunk-DEQUVHHE.mjs";

// src/providers/feature-flag-provider/index.tsx
import { createContext, useContext } from "react";

// src/hooks/api/feature-flags.tsx
import { useQuery } from "@tanstack/react-query";
var useFeatureFlags = () => {
  return useQuery({
    queryKey: ["admin", "feature-flags"],
    queryFn: async () => {
      const response = await sdk.client.fetch("/admin/feature-flags", {
        method: "GET"
      });
      return response.feature_flags;
    },
    staleTime: 5 * 60 * 1e3,
    // Cache for 5 minutes
    cacheTime: 10 * 60 * 1e3
    // Keep in cache for 10 minutes
  });
};

// src/providers/feature-flag-provider/index.tsx
import { jsx } from "react/jsx-runtime";
var FeatureFlagContext = createContext(null);
var useFeatureFlag = (flag) => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    return false;
  }
  return context.isFeatureEnabled(flag);
};
var FeatureFlagProvider = ({ children }) => {
  const { data: flags = {}, isLoading, error } = useFeatureFlags();
  const isFeatureEnabled = (flag) => {
    const enabled = flags[flag] === true;
    return enabled;
  };
  return /* @__PURE__ */ jsx(FeatureFlagContext.Provider, { value: { flags, isLoading, isFeatureEnabled }, children });
};

export {
  useFeatureFlag,
  FeatureFlagProvider
};
