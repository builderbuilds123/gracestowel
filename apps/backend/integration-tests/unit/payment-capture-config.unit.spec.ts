/**
 * Unit tests for PAYMENT_CAPTURE_DELAY_MS configuration
 */

describe("PAYMENT_CAPTURE_DELAY_MS Configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        // Mock dependencies to avoid actual connections
        jest.mock("bullmq", () => ({
             Queue: jest.fn(),
             Worker: jest.fn(), 
        }));
        jest.mock("../../src/utils/stripe", () => ({ 
             getStripeClient: jest.fn() 
        }));
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    it("should respect PAYMENT_CAPTURE_DELAY_MS env var in payment-capture-queue", () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "10000";
        // Re-require to re-evaluate top-level constants
        const { PAYMENT_CAPTURE_DELAY_MS } = require("../../src/lib/payment-capture-queue");
        expect(PAYMENT_CAPTURE_DELAY_MS).toBe(10000);
    });

    it("should default to 1 hour in payment-capture-queue if not set", () => {
        delete process.env.PAYMENT_CAPTURE_DELAY_MS;
        const { PAYMENT_CAPTURE_DELAY_MS } = require("../../src/lib/payment-capture-queue");
        expect(PAYMENT_CAPTURE_DELAY_MS).toBe(3600000);
    });

    it("should respect PAYMENT_CAPTURE_DELAY_MS in ModificationTokenService", () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "10000"; // 10 seconds
        const { ModificationTokenService } = require("../../src/services/modification-token");
        const service = new ModificationTokenService();
        // Accessing private property via any type cast for testing
        expect((service as any).windowSeconds).toBe(10);
    });

    it("should default to 1 hour in ModificationTokenService if not set", () => {
        delete process.env.PAYMENT_CAPTURE_DELAY_MS;
        const { ModificationTokenService } = require("../../src/services/modification-token");
        const service = new ModificationTokenService();
        expect((service as any).windowSeconds).toBe(3600);
    });

    it("should default to 1 hour in ModificationTokenService if env var is invalid", () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "not-a-number";
        const { ModificationTokenService } = require("../../src/services/modification-token");
        const service = new ModificationTokenService();
        // Falls back to default when env var is non-numeric
        expect((service as any).windowSeconds).toBe(3600);
    });
});
