import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import customerCreatedHandler from "../customer-created";

const { mockStartEmailWorker, mockEnqueueEmail, mockSendAdminNotification, mockTrackEvent } =
  vi.hoisted(() => ({
    mockStartEmailWorker: vi.fn(),
    mockEnqueueEmail: vi.fn().mockResolvedValue(true),
    mockSendAdminNotification: vi.fn().mockResolvedValue(undefined),
    mockTrackEvent: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("../../workers/email-worker", () => ({
  startEmailWorker: mockStartEmailWorker,
}));

vi.mock("../../lib/email-queue", () => ({
  enqueueEmail: mockEnqueueEmail,
}));

vi.mock("../../lib/admin-notifications", () => ({
  sendAdminNotification: mockSendAdminNotification,
  AdminNotificationType: {
    CUSTOMER_CREATED: "customer_created",
  },
}));

vi.mock("../../utils/analytics", () => ({
  trackEvent: mockTrackEvent,
}));

describe("customerCreatedHandler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not start email worker in integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";
    process.env.REDIS_URL = "redis://localhost:6379";

    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const query = {
      graph: vi.fn().mockResolvedValue({ data: [] }),
    };

    await customerCreatedHandler({
      event: { data: { id: "cus_test" } },
      container: {
        resolve: (key: string) => (key === "query" ? query : logger),
      },
    } as never);

    expect(mockStartEmailWorker).not.toHaveBeenCalled();
  });

  it("does not enqueue welcome email in integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";

    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const query = {
      graph: vi.fn().mockResolvedValue({
        data: [{ id: "cust_1", email: "test@example.com", first_name: "Test" }],
      }),
    };

    await customerCreatedHandler({
      event: { data: { id: "cust_1" } },
      container: {
        resolve: (key: string) => (key === "query" ? query : logger),
      },
    } as never);

    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});
