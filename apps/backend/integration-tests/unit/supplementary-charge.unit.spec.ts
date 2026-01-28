/**
 * Unit tests for supplementary charge workflow handlers
 *
 * Tests the extracted handler functions from supplementary-charge.ts:
 * - createSupplementaryPCHandler: Creates PaymentCollection + links to order
 * - prepareStripeCustomerHandler: Finds/creates Stripe Customer + attaches PM
 * - createSupplementarySessionHandler: Creates PaymentSession for off-session charge
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockStripeRetrievePM = vi.fn();
const mockStripeAttachPM = vi.fn();
const mockStripeCustomersList = vi.fn();
const mockStripeCustomersCreate = vi.fn();

vi.mock("../../src/utils/stripe", () => ({
    getStripeClient: () => ({
        paymentMethods: {
            retrieve: mockStripeRetrievePM,
            attach: mockStripeAttachPM,
        },
        customers: {
            list: mockStripeCustomersList,
            create: mockStripeCustomersCreate,
        },
    }),
}));

const mockCreatePaymentCollections = vi.fn();
const mockCreatePaymentSession = vi.fn();
const mockRemoteLinkCreate = vi.fn();
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

function makeContainer(overrides: Record<string, unknown> = {}) {
    return {
        resolve: vi.fn((key: string) => {
            if (key === "logger") return mockLogger;
            if (key === "remoteLink") return { create: mockRemoteLinkCreate };
            if (key === Modules.PAYMENT)
                return {
                    createPaymentCollections: mockCreatePaymentCollections,
                    createPaymentSession: mockCreatePaymentSession,
                    ...overrides,
                };
            return null;
        }),
    } as unknown as MedusaContainer;
}

// ── Import handlers (AFTER mocks) ─────────────────────────────────────────────

import {
    createSupplementaryPCHandler,
    prepareStripeCustomerHandler,
    createSupplementarySessionHandler,
} from "../../src/workflows/supplementary-charge";

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
});

describe("createSupplementaryPCHandler", () => {
    it("creates PC with supplementary_charge metadata and correct cents→major conversion", async () => {
        mockCreatePaymentCollections.mockResolvedValue([{ id: "pc_supp_1" }]);
        mockRemoteLinkCreate.mockResolvedValue([]);

        const result = await createSupplementaryPCHandler(
            { orderId: "order_1", amount: 2500, currencyCode: "usd" },
            { container: makeContainer() }
        );

        expect(result.paymentCollectionId).toBe("pc_supp_1");
        // Amount should be converted from cents (2500) to major units (25)
        expect(mockCreatePaymentCollections).toHaveBeenCalledWith([
            expect.objectContaining({
                amount: 25,
                currency_code: "usd",
                metadata: expect.objectContaining({
                    supplementary_charge: true,
                    source_order_id: "order_1",
                    amount_in_cents: 2500,
                }),
            }),
        ]);
    });

    it("links PC to order via remoteLink", async () => {
        mockCreatePaymentCollections.mockResolvedValue([{ id: "pc_supp_2" }]);
        mockRemoteLinkCreate.mockResolvedValue([]);

        await createSupplementaryPCHandler(
            { orderId: "order_2", amount: 1000, currencyCode: "usd" },
            { container: makeContainer() }
        );

        expect(mockRemoteLinkCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                [Modules.ORDER]: { order_id: "order_2" },
                [Modules.PAYMENT]: { payment_collection_id: "pc_supp_2" },
            })
        );
    });

    it("throws for zero amount", async () => {
        await expect(
            createSupplementaryPCHandler(
                { orderId: "order_3", amount: 0, currencyCode: "usd" },
                { container: makeContainer() }
            )
        ).rejects.toThrow("Invalid supplementary amount");
    });

    it("throws for negative amount", async () => {
        await expect(
            createSupplementaryPCHandler(
                { orderId: "order_4", amount: -100, currencyCode: "usd" },
                { container: makeContainer() }
            )
        ).rejects.toThrow("Invalid supplementary amount");
    });
});

describe("prepareStripeCustomerHandler", () => {
    it("reuses existing customer when PM already attached", async () => {
        mockStripeRetrievePM.mockResolvedValue({
            id: "pm_1",
            customer: "cus_existing",
        });

        const result = await prepareStripeCustomerHandler(
            { stripePaymentMethodId: "pm_1", customerEmail: "test@example.com", orderId: "order_1" },
            { container: makeContainer() }
        );

        expect(result.stripeCustomerId).toBe("cus_existing");
        expect(mockStripeCustomersList).not.toHaveBeenCalled();
        expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
        expect(mockStripeAttachPM).not.toHaveBeenCalled();
    });

    it("finds existing customer by email when PM not attached", async () => {
        mockStripeRetrievePM.mockResolvedValue({ id: "pm_2", customer: null });
        mockStripeCustomersList.mockResolvedValue({
            data: [{ id: "cus_found" }],
        });
        mockStripeAttachPM.mockResolvedValue({});

        const result = await prepareStripeCustomerHandler(
            { stripePaymentMethodId: "pm_2", customerEmail: "found@example.com", orderId: "order_2" },
            { container: makeContainer() }
        );

        expect(result.stripeCustomerId).toBe("cus_found");
        expect(mockStripeCustomersList).toHaveBeenCalledWith(
            expect.objectContaining({ email: "found@example.com", limit: 1 })
        );
        expect(mockStripeAttachPM).toHaveBeenCalledWith("pm_2", { customer: "cus_found" });
    });

    it("creates new customer when no match found", async () => {
        mockStripeRetrievePM.mockResolvedValue({ id: "pm_3", customer: null });
        mockStripeCustomersList.mockResolvedValue({ data: [] });
        mockStripeCustomersCreate.mockResolvedValue({ id: "cus_new" });
        mockStripeAttachPM.mockResolvedValue({});

        const result = await prepareStripeCustomerHandler(
            { stripePaymentMethodId: "pm_3", customerEmail: "new@example.com", orderId: "order_3" },
            { container: makeContainer() }
        );

        expect(result.stripeCustomerId).toBe("cus_new");
        expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "new@example.com",
                metadata: expect.objectContaining({ created_for: "supplementary_charge" }),
            })
        );
    });

    it("creates anonymous customer when no email", async () => {
        mockStripeRetrievePM.mockResolvedValue({ id: "pm_4", customer: null });
        mockStripeCustomersCreate.mockResolvedValue({ id: "cus_anon" });
        mockStripeAttachPM.mockResolvedValue({});

        const result = await prepareStripeCustomerHandler(
            { stripePaymentMethodId: "pm_4", orderId: "order_4" },
            { container: makeContainer() }
        );

        expect(result.stripeCustomerId).toBe("cus_anon");
        expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ anonymous: "true" }),
            })
        );
        expect(mockStripeCustomersList).not.toHaveBeenCalled();
    });

    it("handles 'already attached' error gracefully", async () => {
        mockStripeRetrievePM.mockResolvedValue({ id: "pm_5", customer: null });
        mockStripeCustomersCreate.mockResolvedValue({ id: "cus_5" });
        mockStripeAttachPM.mockRejectedValue(
            new Error("This PaymentMethod has already been attached to a Customer")
        );

        const result = await prepareStripeCustomerHandler(
            { stripePaymentMethodId: "pm_5", orderId: "order_5" },
            { container: makeContainer() }
        );

        // Should NOT throw, should return successfully
        expect(result.stripeCustomerId).toBe("cus_5");
    });

    it("re-throws non-'already attached' errors", async () => {
        mockStripeRetrievePM.mockResolvedValue({ id: "pm_6", customer: null });
        mockStripeCustomersCreate.mockResolvedValue({ id: "cus_6" });
        mockStripeAttachPM.mockRejectedValue(new Error("Stripe rate limit"));

        await expect(
            prepareStripeCustomerHandler(
                { stripePaymentMethodId: "pm_6", orderId: "order_6" },
                { container: makeContainer() }
            )
        ).rejects.toThrow("Stripe rate limit");
    });
});

describe("createSupplementarySessionHandler", () => {
    it("creates session with off_session=true, confirm=true, capture_method='manual'", async () => {
        mockCreatePaymentSession.mockResolvedValue({ id: "ps_1" });

        const result = await createSupplementarySessionHandler(
            {
                paymentCollectionId: "pc_1",
                stripePaymentMethodId: "pm_1",
                stripeCustomerId: "cus_1",
                amount: 5000,
                currencyCode: "usd",
            },
            { container: makeContainer() }
        );

        expect(result.paymentSessionId).toBe("ps_1");
        expect(mockCreatePaymentSession).toHaveBeenCalledWith(
            "pc_1",
            expect.objectContaining({
                provider_id: "pp_stripe",
                currency_code: "usd",
                amount: 50, // 5000 cents → 50 major
                data: expect.objectContaining({
                    payment_method: "pm_1",
                    off_session: true,
                    confirm: true,
                    capture_method: "manual",
                }),
            })
        );
    });

    it("passes stripeCustomerId in context.account_holder.data.id", async () => {
        mockCreatePaymentSession.mockResolvedValue({ id: "ps_2" });

        await createSupplementarySessionHandler(
            {
                paymentCollectionId: "pc_2",
                stripePaymentMethodId: "pm_2",
                stripeCustomerId: "cus_stripe_123",
                amount: 3000,
                currencyCode: "usd",
            },
            { container: makeContainer() }
        );

        expect(mockCreatePaymentSession).toHaveBeenCalledWith(
            "pc_2",
            expect.objectContaining({
                context: {
                    account_holder: {
                        data: {
                            id: "cus_stripe_123",
                        },
                    },
                },
            })
        );
    });
});
