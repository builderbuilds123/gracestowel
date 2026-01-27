import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import customerPasswordResetHandler from "../customer-password-reset";

const { mockEnqueueEmail, mockGetEnv } = vi.hoisted(() => ({
  mockEnqueueEmail: vi.fn(),
  mockGetEnv: vi.fn(),
}));

vi.mock("../../lib/email-queue", () => ({
  enqueueEmail: mockEnqueueEmail,
}));

vi.mock("../../lib/env", () => ({
  getEnv: mockGetEnv,
}));

describe("customerPasswordResetHandler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("queues reset email with storefront URL and token", async () => {
    mockGetEnv.mockReturnValue({ STOREFRONT_URL: "https://example.com" });

    const query = {
      graph: vi.fn().mockResolvedValue({
        data: [{ id: "cust_1", email: "test@example.com", first_name: "Test" }],
      }),
    };

    const logger = { info: vi.fn(), error: vi.fn() };

    await customerPasswordResetHandler({
      event: {
        data: {
          entity_id: "test@example.com",
          token: "tok_123",
          actor_type: "customer",
        },
      },
      container: {
        resolve: (key: string) => (key === "query" ? query : logger),
      },
    } as never);

    expect(query.graph).toHaveBeenCalledWith({
      entity: "customer",
      fields: ["id", "email", "first_name"],
      filters: { email: "test@example.com" },
    });

    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "test@example.com",
        data: expect.objectContaining({
          reset_url: "https://example.com/account/reset-password?token=tok_123",
        }),
      })
    );
  });

  it("skips queuing email during integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";

    const query = {
      graph: vi.fn().mockResolvedValue({
        data: [{ id: "cust_1", email: "test@example.com", first_name: "Test" }],
      }),
    };

    const logger = { info: vi.fn(), error: vi.fn() };

    await customerPasswordResetHandler({
      event: {
        data: {
          entity_id: "test@example.com",
          token: "tok_123",
          actor_type: "customer",
        },
      },
      container: {
        resolve: (key: string) => (key === "query" ? query : logger),
      },
    } as never);

    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});
