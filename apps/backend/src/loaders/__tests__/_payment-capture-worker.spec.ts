import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import paymentCaptureWorkerLoader from "../payment-capture-worker";

const { mockStartPaymentCaptureWorker } = vi.hoisted(() => ({
  mockStartPaymentCaptureWorker: vi.fn(),
}));

vi.mock("../../workers/payment-capture-worker", () => ({
  startPaymentCaptureWorker: mockStartPaymentCaptureWorker,
}));

describe("paymentCaptureWorkerLoader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips starting the worker during integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";

    await paymentCaptureWorkerLoader({} as never);

    expect(mockStartPaymentCaptureWorker).not.toHaveBeenCalled();
  });
});
