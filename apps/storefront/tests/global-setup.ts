/**
 * Global Setup for Vitest
 * Runs once before all test files
 * Ensures localStorage is available for MSW
 */
export default function globalSetup() {
  // Ensure localStorage is available globally for MSW CookieStore
  // This needs to be set before any test files import MSW
  if (typeof global.localStorage === "undefined") {
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage;
  }

  return () => {
    // Teardown logic (if needed)
  };
}
