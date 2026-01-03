import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "integration-tests/unit/**/*.spec.ts",
      "integration-tests/unit/**/*.spec.tsx",
      "src/**/__tests__/**/*.spec.ts",
    ],
    // Ensure we don't pick up integration tests that might still rely on Jest
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/integration-tests/http/**",
      "**/integration-tests/modules/**",
    ],
    // Isolate tests that use vi.resetModules() to prevent module loading issues
    poolOptions: {
      threads: {
        isolate: true,
      },
    },
  },
})
