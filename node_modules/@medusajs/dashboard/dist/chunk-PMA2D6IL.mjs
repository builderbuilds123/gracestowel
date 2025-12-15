import {
  useExtension
} from "./chunk-C5P5PL3E.mjs";

// src/components/utilities/i18n/i18n.tsx
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// src/i18n/config.ts
var defaultI18nOptions = {
  debug: process.env.NODE_ENV === "development",
  detection: {
    caches: ["cookie", "localStorage", "header"],
    lookupCookie: "lng",
    lookupLocalStorage: "lng",
    order: ["cookie", "localStorage", "header"]
  },
  fallbackLng: "en",
  fallbackNS: "translation",
  interpolation: {
    escapeValue: false
  }
};

// src/components/utilities/i18n/i18n.tsx
var I18n = () => {
  const { getI18nResources } = useExtension();
  if (i18n.isInitialized) {
    return null;
  }
  const resources = getI18nResources();
  i18n.use(
    new LanguageDetector(null, {
      lookupCookie: "lng",
      lookupLocalStorage: "lng"
    })
  ).use(initReactI18next).init({
    ...defaultI18nOptions,
    resources,
    supportedLngs: Object.keys(resources)
  });
  return null;
};

export {
  i18n,
  I18n
};
