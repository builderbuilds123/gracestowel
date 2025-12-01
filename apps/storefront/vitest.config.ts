import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use jsdom for better compatibility with MSW and browser APIs
    environment: "jsdom",
    globals: true,
    // Setup files for global test configuration
    setupFiles: ["./tests/setup.ts"],
    // Include patterns
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // Exclude patterns
    exclude: ["node_modules", "dist", ".react-router"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        "app/**/*.d.ts",
        "app/**/*.test.{ts,tsx}",
        "app/**/*.spec.{ts,tsx}",
        "app/routes.ts",
        "app/entry.*.tsx",
      ],
      // Coverage thresholds - temporarily disabled for feature development
      // TODO: Re-enable and increase thresholds as test coverage improves
      // thresholds: {
      //   statements: 50,
      //   branches: 50,
      //   functions: 50,
      //   lines: 50,
      // },
    },
    // Test timeout
    testTimeout: 10000,
    // Hook timeout for setup/teardown
    hookTimeout: 10000,
    // CSS handling
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});

