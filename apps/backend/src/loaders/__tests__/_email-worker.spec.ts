import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import emailWorkerLoader from "../email-worker";

const { mockStartEmailWorker } = vi.hoisted(() => ({
  mockStartEmailWorker: vi.fn(),
}));

vi.mock("../../workers/email-worker", () => ({
  startEmailWorker: mockStartEmailWorker,
}));

describe("emailWorkerLoader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips starting the email worker during integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";
    process.env.REDIS_URL = "redis://localhost:6379";

    await emailWorkerLoader({} as never);

    expect(mockStartEmailWorker).not.toHaveBeenCalled();
  });
});
