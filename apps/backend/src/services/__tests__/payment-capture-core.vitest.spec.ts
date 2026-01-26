import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MedusaContainer } from "@medusajs/framework/types";
import { captureAllOrderPayments, executePaymentCapture } from "../payment-capture-core";
import { Modules } from "@medusajs/framework/utils";

const mockStripeRetrieve = vi.fn();
const mockStripeCapture = vi.fn();

vi.mock("../../utils/stripe", () => ({
  getStripeClient: () => ({
    paymentIntents: {
      retrieve: mockStripeRetrieve,
      capture: mockStripeCapture,
    },
  }),
}));

const mockCaptureRun = vi.fn().mockResolvedValue({});
const mockCapturePaymentWorkflow = vi.fn(() => ({ run: mockCaptureRun }));

vi.mock("@medusajs/medusa/core-flows", () => ({
  capturePaymentWorkflow: () => mockCapturePaymentWorkflow(),
}));

const mockQueryGraph = vi.fn();
const mockUpdateOrders = vi.fn().mockResolvedValue([]);
const mockUpdatePaymentCollections = vi.fn().mockResolvedValue({});
const mockAddOrderTransactions = vi.fn().mockResolvedValue({});

const mockContainer = {
  resolve: vi.fn((key: string) => {
    if (key === "query") return { graph: mockQueryGraph };
    return null;
  }),
} as unknown as MedusaContainer;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureAllOrderPayments (native capture)", () => {
  it("captures original PC via capturePaymentWorkflow instead of direct Stripe", async () => {
    mockQueryGraph.mockResolvedValue({
      data: [
        {
          id: "order_1",
          status: "pending",
          currency_code: "usd",
          payment_collections: [
            {
              id: "pc_1",
              status: "authorized",
              amount: 10000,
              metadata: {},
              payments: [
                {
                  id: "pay_1",
                  amount: 10000,
                  captured_at: null,
                  data: { id: "pi_1" },
                },
              ],
            },
          ],
        },
      ],
    });

    await captureAllOrderPayments(mockContainer, "order_1", "test");

    expect(mockCaptureRun).toHaveBeenCalledWith({ input: { payment_id: "pay_1" } });
    expect(mockStripeRetrieve).not.toHaveBeenCalled();
    expect(mockStripeCapture).not.toHaveBeenCalled();
  });

  it("captures supplementary PC via capturePaymentWorkflow (existing behavior)", async () => {
    mockQueryGraph.mockResolvedValue({
      data: [
        {
          id: "order_2",
          status: "pending",
          currency_code: "usd",
          payment_collections: [
            {
              id: "pc_2",
              status: "authorized",
              amount: 2000,
              metadata: { supplementary_charge: true },
              payments: [
                {
                  id: "pay_2",
                  amount: 2000,
                  captured_at: null,
                  data: { id: "pi_2" },
                },
              ],
            },
          ],
        },
      ],
    });

    await captureAllOrderPayments(mockContainer, "order_2", "test");

    expect(mockCaptureRun).toHaveBeenCalledWith({ input: { payment_id: "pay_2" } });
  });

  it("skips capture when no payment record is present", async () => {
    mockQueryGraph.mockResolvedValue({
      data: [
        {
          id: "order_3",
          status: "pending",
          currency_code: "usd",
          payment_collections: [
            {
              id: "pc_3",
              status: "authorized",
              amount: 1000,
              metadata: {},
              payments: [],
            },
          ],
        },
      ],
    });

    const result = await captureAllOrderPayments(mockContainer, "order_3", "test");

    expect(result.failedCount).toBe(1);
  });
});

describe("executePaymentCapture (worker path)", () => {
  it("uses capturePaymentWorkflow for the original payment record", async () => {
    const mockContainerForExecute = {
      resolve: vi.fn((key: string) => {
        if (key === "query") return { graph: mockQueryGraph };
        if (key === "order" || key === Modules.ORDER) {
          return {
            updateOrders: mockUpdateOrders,
            addOrderTransactions: mockAddOrderTransactions,
          };
        }
        if (key === Modules.PAYMENT) return { updatePaymentCollections: mockUpdatePaymentCollections };
        return null;
      }),
    } as unknown as MedusaContainer;

    mockQueryGraph.mockResolvedValueOnce({
      data: [
        {
          id: "order_4",
          status: "pending",
          payment_collections: [
            {
              id: "pc_4",
              status: "authorized",
              payments: [{ id: "pay_4", captured_at: null, data: { id: "pi_1" } }],
            },
          ],
        },
      ],
    });

    await executePaymentCapture(mockContainerForExecute, "order_4", "pi_1", "test");

    expect(mockCaptureRun).toHaveBeenCalledWith({ input: { payment_id: "pay_4" } });
    expect(mockStripeCapture).not.toHaveBeenCalled();
  });
});
