// Only load Medusa env for integration tests
if (process.env.TEST_TYPE !== "unit") {
  const { loadEnv } = require("@medusajs/utils");
  loadEnv("test", process.cwd());
}

module.exports = {
  transform: {
    "^.+\\.[jt]sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true, decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "tsx", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
};

if (process.env.TEST_TYPE === "unit") {
  // Unit tests: no external dependencies, no setup file needed
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:http") {
  // Integration tests: require PostgreSQL/Redis, use Medusa test runner
  module.exports.setupFiles = ["./integration-tests/setup.js"];
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.setupFiles = ["./integration-tests/setup.js"];
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
}
