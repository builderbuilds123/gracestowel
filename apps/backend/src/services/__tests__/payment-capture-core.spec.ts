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

const mockStripe = {
    paymentIntents: {
        retrieve: jest.fn(),
        capture: jest.fn(),
    },
};

const mockQuery = {
    graph: jest.fn(),
};

const mockOrderService = {
    updateOrders: jest.fn(),
    addOrderTransactions: jest.fn(),
};

const mockPaymentModule = {
    updatePaymentCollections: jest.fn(),
};

const mockContainer = {
    resolve: jest.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "query") return mockQuery;
        if (key === "order") return mockOrderService;
        if (key === "payment") return mockPaymentModule; // Modules.PAYMENT
        return null;
    }),
} as unknown as MedusaContainer;

jest.mock("../utils/stripe", () => ({
    getStripeClient: () => mockStripe,
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
        it("should capture payment when status is requires_capture", async () => {
            // Setup
            mockStripe.paymentIntents.retrieve.mockResolvedValue({
                id: "pi_1",
                status: "requires_capture",
                amount_capturable: 15050,
                amount: 15050,
            });

            // Mock fetchOrderTotal internal call (we assume it works or we mock query)
            mockQuery.graph.mockResolvedValueOnce({ // for fetchOrderTotal
                data: [{
                    id: "order_1",
                    total: 150.50,
                    currency_code: "usd",
                    status: "pending"
                }]
            })
            .mockResolvedValueOnce({ // for updateOrderAfterCapture -> currency
                 data: [{ id: "order_1", currency_code: "usd", status: "pending" }]
            })
            .mockResolvedValueOnce({ // for updatePaymentCollection
                 data: [{ 
                     id: "order_1", 
                     payment_collections: [{ id: "pc_1", status: "authorized", payments: [{ id: "pay_1" }] }] 
                 }]
            });

            mockStripe.paymentIntents.capture.mockResolvedValue({ status: "succeeded" });

            await executePaymentCapture(mockContainer, "order_1", "pi_1");

            expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_1", {
                amount_to_capture: 15050,
            }, expect.anything());

            expect(mockPaymentModule.updatePaymentCollections).toHaveBeenCalledWith([{
                id: "pc_1",
                status: "completed" // PaymentCollectionStatus.COMPLETED
            }]);
        });

        it("should NOT capture if already succeeded", async () => {
            mockStripe.paymentIntents.retrieve.mockResolvedValue({
                id: "pi_1",
                status: "succeeded",
            });

            await executePaymentCapture(mockContainer, "order_1", "pi_1");

            expect(mockStripe.paymentIntents.capture).not.toHaveBeenCalled();
            // Should still try to update Medusa state
            expect(mockQuery.graph).toHaveBeenCalled(); 
        });

        it("should cap capture amount at amount_capturable", async () => {
             mockStripe.paymentIntents.retrieve.mockResolvedValue({
                id: "pi_1",
                status: "requires_capture",
                amount_capturable: 10000, // Authorized for $100
                amount: 10000,
            });

            // Order total is $150 (increased)
            mockQuery.graph.mockResolvedValueOnce({
                data: [{
                    id: "order_1",
                    total: 150.00,
                    currency_code: "usd",
                    status: "pending"
                }]
            });
            // ... subsequent mocks for updates ...
            mockQuery.graph.mockResolvedValue({ data: [] }); // Default fallback

            await executePaymentCapture(mockContainer, "order_1", "pi_1").catch(() => {});

            // Should have logged warning
            expect(mockLogger.warn).toHaveBeenCalledWith(
                "payment-capture-core", 
                "Order total exceeds capturable amount", 
                expect.objectContaining({ totalCents: 15000, amountToCapture: 10000 })
            );

            // Capture should use min(15000, 10000) = 10000
            expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_1", {
                amount_to_capture: 10000,
            }, expect.anything());
        });
    });
});
