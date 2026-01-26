import { executePaymentCapture, fetchOrderTotal } from "../payment-capture-core";
import { MedusaContainer } from "@medusajs/framework/types";

// Mocks
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    critical: jest.fn(),
};

const mockQuery = {
    graph: jest.fn(),
};

const mockCaptureRun = jest.fn().mockResolvedValue({});

const mockContainer = {
    resolve: jest.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "query") return mockQuery;
        return null;
    }),
} as unknown as MedusaContainer;

jest.mock("@medusajs/medusa/core-flows", () => ({
    capturePaymentWorkflow: () => ({ run: mockCaptureRun }),
}));

describe("payment-capture-core", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("fetchOrderTotal", () => {
        it("should return correct total from order.total (BigNumber/numeric_)", async () => {
            mockQuery.graph.mockResolvedValue({
                data: [{
                    id: "order_1",
                    total: { numeric_: 150.50 }, // Medusa v2 often returns objects for BigNumber
                    currency_code: "usd",
                    status: "pending"
                }]
            });

            const result = await fetchOrderTotal(mockContainer, "order_1");
            expect(result).toEqual({
                totalCents: 15050, // 150.50 * 100
                currencyCode: "usd",
                status: "pending"
            });
        });

        it("should interpret metadata.updated_total if present", async () => {
            mockQuery.graph.mockResolvedValue({
                data: [{
                    id: "order_1",
                    total: 100,
                    metadata: { updated_total: 200.00 },
                    currency_code: "usd",
                    status: "pending"
                }]
            });

            const result = await fetchOrderTotal(mockContainer, "order_1");
            expect(result).toEqual({
                totalCents: 20000, // 200.00 * 100
                currencyCode: "usd",
                status: "pending"
            });
        });
    });

    describe("executePaymentCapture", () => {
        it("captures payment via capturePaymentWorkflow when payment record exists", async () => {
            mockQuery.graph
                .mockResolvedValueOnce({
                    data: [{
                        id: "order_1",
                        status: "pending",
                        payment_collections: [{
                            id: "pc_1",
                            status: "authorized",
                            payments: [{ id: "pay_1", captured_at: null, data: { id: "pi_1" } }],
                        }],
                    }],
                })
                .mockResolvedValueOnce({ data: [{ id: "order_1", payment_collections: [] }] });

            await executePaymentCapture(mockContainer, "order_1", "pi_1");

            expect(mockCaptureRun).toHaveBeenCalledWith({ input: { payment_id: "pay_1" } });
        });
    });
});
