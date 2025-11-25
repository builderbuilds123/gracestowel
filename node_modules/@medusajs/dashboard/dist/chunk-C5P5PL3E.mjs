// src/providers/extension-provider/use-extension.tsx
import { useContext } from "react";

// src/providers/extension-provider/extension-context.tsx
import { createContext } from "react";
var ExtensionContext = createContext(
  null
);

// src/providers/extension-provider/use-extension.tsx
var useExtension = () => {
  const context = useContext(ExtensionContext);
  if (!context) {
    throw new Error("useExtension must be used within a ExtensionProvider");
  }
  return context;
};

// src/providers/extension-provider/extension-provider.tsx
import { jsx } from "react/jsx-runtime";
var ExtensionProvider = ({
  api,
  children
}) => {
  return /* @__PURE__ */ jsx(ExtensionContext.Provider, { value: api, children });
};

export {
  ExtensionProvider,
  useExtension
};
