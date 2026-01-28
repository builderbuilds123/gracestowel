/**
 * Unit tests for the smart capture algorithm in payment-capture-core.ts
 *
 * Tests captureAllOrderPayments() which handles real money:
 * - Sorts PCs ascending by amount
 * - Distributes order total across uncaptured PCs
 * - Partial captures when order total < authorized amount
 * - Cancels excess PCs when order total is fully covered
 * - Guards against canceled orders, missing PCs, insufficient authorization
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../../src/utils/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockCaptureRun = vi.fn().mockResolvedValue({});
vi.mock("@medusajs/medusa/core-flows", () => ({
    capturePaymentWorkflow: vi.fn(() => ({ run: mockCaptureRun })),
}));

vi.mock("../../src/utils/stripe", () => ({
    getStripeClient: () => ({
        paymentIntents: { retrieve: vi.fn(), capture: vi.fn() },
    }),
}));

const mockQueryGraph = vi.fn();
const mockCancelPayment = vi.fn().mockResolvedValue(undefined);
const mockUpdatePaymentCollections = vi.fn().mockResolvedValue({});
const mockUpdatePayment = vi.fn().mockResolvedValue(undefined);

const mockContainer = {
    resolve: vi.fn((key: string) => {
        if (key === "query") return { graph: mockQueryGraph };
        if (key === Modules.PAYMENT)
            return {
                cancelPayment: mockCancelPayment,
                updatePaymentCollections: mockUpdatePaymentCollections,
                updatePayment: mockUpdatePayment,
            };
        return null;
    }),
} as unknown as MedusaContainer;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build an order response for the first query.graph call (order + PCs) */
function makeOrderData(
    orderId: string,
    opts: {
        status?: string;
        pcs?: Array<{
            id: string;
            status?: string;
            amount: number;
            metadata?: Record<string, unknown>;
            payments?: Array<{
                id: string;
                amount: number;
                captured_at?: string | null;
                canceled_at?: string | null;
                data?: { id?: string };
            }>;
        }>;
    }
) {
    return {
        data: [
            {
                id: orderId,
                status: opts.status ?? "pending",
                currency_code: "usd",
                metadata: {},
                payment_collections: opts.pcs ?? [],
            },
        ],
    };
}

/** Build the fetchOrderTotal query.graph response (second call) */
function makeOrderTotalData(orderId: string, totalMajor: number) {
    return {
        data: [
            {
                id: orderId,
                total: totalMajor,
                currency_code: "usd",
                status: "pending",
                metadata: {},
            },
        ],
    };
}

// ── Import under test (AFTER mocks) ───────────────────────────────────────────

import { captureAllOrderPayments } from "../../src/services/payment-capture-core";

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
});

describe("captureAllOrderPayments — Smart Capture Algorithm", () => {
    // ── Happy path ─────────────────────────────────────────────────────────

    describe("Happy path", () => {
        it("captures single uncaptured payment for full order total", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_1", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 100,
                                metadata: {},
                                payments: [
                                    {
                                        id: "pay_1",
                                        amount: 100,
                                        captured_at: null,
                                        canceled_at: null,
                                        data: { id: "pi_1" },
                                    },
                                ],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_1", 100));

            const result = await captureAllOrderPayments(mockContainer, "order_1", "test");

            expect(result.capturedCount).toBe(1);
            expect(result.failedCount).toBe(0);
            expect(result.hasPayments).toBe(true);
            expect(mockCaptureRun).toHaveBeenCalledTimes(1);
            expect(mockCaptureRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ payment_id: "pay_1", amount: 100 }),
                })
            );
        });

        it("captures multiple PCs when all needed to cover order total", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_2", {
                        pcs: [
                            {
                                id: "pc_a",
                                status: "authorized",
                                amount: 40,
                                metadata: {},
                                payments: [{ id: "pay_a", amount: 40, captured_at: null, canceled_at: null, data: { id: "pi_a" } }],
                            },
                            {
                                id: "pc_b",
                                status: "authorized",
                                amount: 60,
                                metadata: {},
                                payments: [{ id: "pay_b", amount: 60, captured_at: null, canceled_at: null, data: { id: "pi_b" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_2", 100));

            const result = await captureAllOrderPayments(mockContainer, "order_2", "test");

            expect(result.capturedCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(mockCaptureRun).toHaveBeenCalledTimes(2);
        });
    });

    // ── Already captured ───────────────────────────────────────────────────

    describe("Already captured", () => {
        it("returns allAlreadyCaptured when all PCs have completed status", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_3", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "completed",
                                amount: 100,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 100, captured_at: "2026-01-01", canceled_at: null, data: { id: "pi_1" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_3", 100));

            const result = await captureAllOrderPayments(mockContainer, "order_3", "test");

            expect(result.allAlreadyCaptured).toBe(true);
            expect(result.capturedCount).toBe(0);
            expect(result.skippedCount).toBe(1);
            expect(mockCaptureRun).not.toHaveBeenCalled();
        });

        it("returns allAlreadyCaptured when all payments have captured_at", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_4", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 50, captured_at: "2026-01-01", canceled_at: null, data: { id: "pi_1" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_4", 50));

            const result = await captureAllOrderPayments(mockContainer, "order_4", "test");

            expect(result.allAlreadyCaptured).toBe(true);
            expect(result.capturedCount).toBe(0);
            expect(result.skippedCount).toBe(1);
        });
    });

    // ── Guards ─────────────────────────────────────────────────────────────

    describe("Guards", () => {
        it("returns early with no captures when order is canceled", async () => {
            mockQueryGraph.mockResolvedValueOnce(
                makeOrderData("order_5", {
                    status: "canceled",
                    pcs: [
                        {
                            id: "pc_1",
                            status: "authorized",
                            amount: 100,
                            metadata: {},
                            payments: [{ id: "pay_1", amount: 100, captured_at: null, canceled_at: null, data: { id: "pi_1" } }],
                        },
                    ],
                })
            );

            const result = await captureAllOrderPayments(mockContainer, "order_5", "test");

            expect(result.hasPayments).toBe(true);
            expect(result.capturedCount).toBe(0);
            expect(result.allAlreadyCaptured).toBe(false);
            expect(mockCaptureRun).not.toHaveBeenCalled();
        });

        it("returns hasPayments=false when no payment collections exist", async () => {
            mockQueryGraph.mockResolvedValueOnce(
                makeOrderData("order_6", { pcs: [] })
            );

            const result = await captureAllOrderPayments(mockContainer, "order_6", "test");

            expect(result.hasPayments).toBe(false);
            expect(result.capturedCount).toBe(0);
        });

        it("throws when totalAuthorized < orderTotal", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_7", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_1" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_7", 200));

            await expect(
                captureAllOrderPayments(mockContainer, "order_7", "test")
            ).rejects.toThrow("Insufficient authorized amount");
        });
    });

    // ── Excess PC handling ─────────────────────────────────────────────────

    describe("Excess PC handling", () => {
        it("cancels excess payment and zeros PC amount when order total covered", async () => {
            // 3 PCs [20, 30, 50], orderTotal=50 → capture 20+30, cancel 50
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_8", {
                        pcs: [
                            {
                                id: "pc_a",
                                status: "authorized",
                                amount: 30,
                                metadata: {},
                                payments: [{ id: "pay_a", amount: 30, captured_at: null, canceled_at: null, data: { id: "pi_a" } }],
                            },
                            {
                                id: "pc_b",
                                status: "authorized",
                                amount: 20,
                                metadata: {},
                                payments: [{ id: "pay_b", amount: 20, captured_at: null, canceled_at: null, data: { id: "pi_b" } }],
                            },
                            {
                                id: "pc_c",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_c", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_c" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_8", 50));

            const result = await captureAllOrderPayments(mockContainer, "order_8", "test");

            // Sort ascending: [20, 30, 50] → capture 20 + 30 = 50, cancel 50
            expect(result.capturedCount).toBe(2);
            expect(result.skippedCount).toBe(1); // excess PC canceled
            expect(mockCancelPayment).toHaveBeenCalledWith("pay_c");
            expect(mockUpdatePaymentCollections).toHaveBeenCalledWith("pc_c", { amount: 0 });
        });

        it("handles cancelPayment failure gracefully for excess PCs", async () => {
            mockCancelPayment.mockRejectedValueOnce(new Error("Stripe error"));

            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_9", {
                        pcs: [
                            {
                                id: "pc_a",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_a", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_a" } }],
                            },
                            {
                                id: "pc_b",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_b", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_b" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_9", 50));

            // Should NOT throw even though cancelPayment fails
            const result = await captureAllOrderPayments(mockContainer, "order_9", "test");

            expect(result.capturedCount).toBe(1);
            expect(result.skippedCount).toBe(1); // excess still counted as skipped
        });
    });

    // ── Partial capture ────────────────────────────────────────────────────

    describe("Partial capture", () => {
        it("partial-captures when order total < single PC authorized amount", async () => {
            // 1 PC auth=100, orderTotal=60 → updatePayment with amount_to_capture=6000
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_10", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 100,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 100, captured_at: null, canceled_at: null, data: { id: "pi_1" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_10", 60));

            const result = await captureAllOrderPayments(mockContainer, "order_10", "test");

            expect(result.capturedCount).toBe(1);
            // Should update payment with amount_to_capture for Stripe partial capture
            expect(mockUpdatePayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "pay_1",
                    amount: 60,
                    data: expect.objectContaining({
                        id: "pi_1",
                        amount_to_capture: 6000,
                    }),
                })
            );
            // Should update PC amount before capture
            expect(mockUpdatePaymentCollections).toHaveBeenCalledWith("pc_1", { amount: 60 });
            // Workflow should capture with partial amount
            expect(mockCaptureRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ payment_id: "pay_1", amount: 60 }),
                })
            );
        });

        it("partial-captures last PC when total spans multiple PCs", async () => {
            // 2 PCs [30, 50], orderTotal=45 → capture 30 full, capture 15 from 50
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_11", {
                        pcs: [
                            {
                                id: "pc_a",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_a", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_a" } }],
                            },
                            {
                                id: "pc_b",
                                status: "authorized",
                                amount: 30,
                                metadata: {},
                                payments: [{ id: "pay_b", amount: 30, captured_at: null, canceled_at: null, data: { id: "pi_b" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_11", 45));

            const result = await captureAllOrderPayments(mockContainer, "order_11", "test");

            expect(result.capturedCount).toBe(2);
            // Sorted ascending: [30, 50]. Capture 30 fully, then 15 from 50.
            expect(mockCaptureRun).toHaveBeenCalledTimes(2);
            // Second capture should be partial (15 from 50)
            expect(mockUpdatePayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "pay_a",
                    amount: 15,
                    data: expect.objectContaining({
                        amount_to_capture: 1500,
                    }),
                })
            );
        });
    });

    // ── Filtering ──────────────────────────────────────────────────────────

    describe("Filtering", () => {
        it("skips payments with canceled_at set", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_12", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 50, captured_at: null, canceled_at: "2026-01-01", data: { id: "pi_1" } }],
                            },
                            {
                                id: "pc_2",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_2", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_2" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_12", 50));

            const result = await captureAllOrderPayments(mockContainer, "order_12", "test");

            expect(result.capturedCount).toBe(1);
            expect(result.skippedCount).toBe(1);
            expect(mockCaptureRun).toHaveBeenCalledTimes(1);
            expect(mockCaptureRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ payment_id: "pay_2" }),
                })
            );
        });

        it("skips PCs with completed/captured status", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_13", {
                        pcs: [
                            {
                                id: "pc_done",
                                status: "captured",
                                amount: 30,
                                metadata: {},
                                payments: [{ id: "pay_done", amount: 30, captured_at: "2026-01-01", canceled_at: null, data: { id: "pi_done" } }],
                            },
                            {
                                id: "pc_new",
                                status: "authorized",
                                amount: 70,
                                metadata: {},
                                payments: [{ id: "pay_new", amount: 70, captured_at: null, canceled_at: null, data: { id: "pi_new" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_13", 70));

            const result = await captureAllOrderPayments(mockContainer, "order_13", "test");

            expect(result.capturedCount).toBe(1);
            expect(result.skippedCount).toBe(1);
            expect(mockCaptureRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ payment_id: "pay_new" }),
                })
            );
        });

        it("handles mixed state: some captured, some not", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_14", {
                        pcs: [
                            {
                                id: "pc_captured",
                                status: "completed",
                                amount: 40,
                                metadata: {},
                                payments: [{ id: "pay_captured", amount: 40, captured_at: "2026-01-01", canceled_at: null, data: { id: "pi_captured" } }],
                            },
                            {
                                id: "pc_voided",
                                status: "authorized",
                                amount: 30,
                                metadata: {},
                                payments: [{ id: "pay_voided", amount: 30, captured_at: null, canceled_at: "2026-01-01", data: { id: "pi_voided" } }],
                            },
                            {
                                id: "pc_uncaptured",
                                status: "authorized",
                                amount: 50,
                                metadata: {},
                                payments: [{ id: "pay_uncaptured", amount: 50, captured_at: null, canceled_at: null, data: { id: "pi_uncaptured" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_14", 50));

            const result = await captureAllOrderPayments(mockContainer, "order_14", "test");

            expect(result.capturedCount).toBe(1);
            expect(result.skippedCount).toBe(2); // completed + voided
            expect(mockCaptureRun).toHaveBeenCalledTimes(1);
        });
    });

    // ── Sort order ─────────────────────────────────────────────────────────

    describe("Sort order", () => {
        it("captures smallest payments first", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_15", {
                        pcs: [
                            {
                                id: "pc_big",
                                status: "authorized",
                                amount: 80,
                                metadata: {},
                                payments: [{ id: "pay_big", amount: 80, captured_at: null, canceled_at: null, data: { id: "pi_big" } }],
                            },
                            {
                                id: "pc_small",
                                status: "authorized",
                                amount: 20,
                                metadata: {},
                                payments: [{ id: "pay_small", amount: 20, captured_at: null, canceled_at: null, data: { id: "pi_small" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_15", 100));

            await captureAllOrderPayments(mockContainer, "order_15", "test");

            // First call should be the smaller payment
            expect(mockCaptureRun.mock.calls[0][0].input.payment_id).toBe("pay_small");
            expect(mockCaptureRun.mock.calls[1][0].input.payment_id).toBe("pay_big");
        });
    });

    // ── Supplementary PCs ──────────────────────────────────────────────────

    describe("Supplementary PCs", () => {
        it("captures both original and supplementary PCs correctly", async () => {
            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_16", {
                        pcs: [
                            {
                                id: "pc_original",
                                status: "authorized",
                                amount: 100,
                                metadata: {},
                                payments: [{ id: "pay_orig", amount: 100, captured_at: null, canceled_at: null, data: { id: "pi_orig" } }],
                            },
                            {
                                id: "pc_supp",
                                status: "authorized",
                                amount: 20,
                                metadata: { supplementary_charge: true },
                                payments: [{ id: "pay_supp", amount: 20, captured_at: null, canceled_at: null, data: { id: "pi_supp" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_16", 120));

            const result = await captureAllOrderPayments(mockContainer, "order_16", "test");

            expect(result.capturedCount).toBe(2);
            expect(mockCaptureRun).toHaveBeenCalledTimes(2);
        });
    });

    // ── Error handling ─────────────────────────────────────────────────────

    describe("Error handling", () => {
        it("records failure when capturePaymentWorkflow throws", async () => {
            mockCaptureRun.mockRejectedValueOnce(new Error("Stripe API error"));

            mockQueryGraph
                .mockResolvedValueOnce(
                    makeOrderData("order_17", {
                        pcs: [
                            {
                                id: "pc_1",
                                status: "authorized",
                                amount: 100,
                                metadata: {},
                                payments: [{ id: "pay_1", amount: 100, captured_at: null, canceled_at: null, data: { id: "pi_1" } }],
                            },
                        ],
                    })
                )
                .mockResolvedValueOnce(makeOrderTotalData("order_17", 100));

            const result = await captureAllOrderPayments(mockContainer, "order_17", "test");

            expect(result.failedCount).toBe(1);
            expect(result.capturedCount).toBe(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain("Stripe API error");
        });
    });
});
