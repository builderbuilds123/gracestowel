// src/hooks/use-document-direction.tsx
import { useEffect, useState } from "react";
var useDocumentDirection = () => {
  const [direction, setDirection] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("dir") || void 0;
    }
    return void 0;
  });
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "dir" && mutation.target === document.documentElement) {
          const newDirection = document.documentElement.getAttribute("dir");
          setDirection(newDirection || void 0);
        }
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir"]
    });
    return () => {
      observer.disconnect();
    };
  }, []);
  return direction;
};

export {
  useDocumentDirection
};
