/**
 * Vitest Test Setup
 * Configures global test utilities, MSW server, and accessibility matchers
 */
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

// Import server dynamically to avoid initialization issues
let server: any;

beforeAll(async () => {
  // Dynamically import MSW server to ensure localStorage is available
  const { server: mswServer } = await import("./mocks/server");
  server = mswServer;
  server.listen({ onUnhandledRequest: "warn" });
});

// Reset handlers after each test
afterEach(() => {
  cleanup();
  if (server) {
    server.resetHandlers();
  }
});

// Close MSW server after all tests
afterAll(() => {
  if (server) {
    server.close();
  }
});

