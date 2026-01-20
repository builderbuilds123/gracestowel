import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "integration-tests/integration/**/*.spec.ts",
      "integration-tests/integration/**/*.spec.tsx",
      "src/**/__tests__/**/*.spec.ts",
    ],
    // Ensure we don't pick up integration tests that might still rely on Jest
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/integration-tests/http/**",
      "**/integration-tests/modules/**",
    ],
  },
})
