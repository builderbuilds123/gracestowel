import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Unit tests for PAYMENT_CAPTURE_DELAY_MS configuration
 */

describe("PAYMENT_CAPTURE_DELAY_MS Configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        // Mock dependencies to avoid actual connections
        vi.mock("bullmq", () => ({
             Queue: vi.fn(),
             Worker: vi.fn(), 
        }));
        vi.mock("../../src/utils/stripe", () => ({ 
             getStripeClient: vi.fn() 
        }));
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    it("should respect PAYMENT_CAPTURE_DELAY_MS env var in payment-capture-queue", async () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "10000";
        // Re-import to re-evaluate top-level constants
        const { PAYMENT_CAPTURE_DELAY_MS } = await import("../../src/lib/payment-capture-queue");
        expect(PAYMENT_CAPTURE_DELAY_MS).toBe(10000);
    });

    it("should default to 59:30 (3570000ms) in payment-capture-queue if not set (Story 6.3)", async () => {
        delete process.env.PAYMENT_CAPTURE_DELAY_MS;
        delete process.env.CAPTURE_BUFFER_SECONDS;
        const { PAYMENT_CAPTURE_DELAY_MS } = await import("../../src/lib/payment-capture-queue");
        // Story 6.3: Default is 60*60 - 30 = 3570 seconds = 3570000ms (30s buffer)
        expect(PAYMENT_CAPTURE_DELAY_MS).toBe(3570000);
    });

    it("should respect PAYMENT_CAPTURE_DELAY_MS in ModificationTokenService", async () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "10000"; // 10 seconds
        const { ModificationTokenService } = await import("../../src/services/modification-token");
        const service = new ModificationTokenService();
        // Accessing private property via any type cast for testing
        expect((service as any).windowSeconds).toBe(10);
    });

    it("should default to 1 hour in ModificationTokenService if not set", async () => {
        delete process.env.PAYMENT_CAPTURE_DELAY_MS;
        const { ModificationTokenService } = await import("../../src/services/modification-token");
        const service = new ModificationTokenService();
        expect((service as any).windowSeconds).toBe(3600);
    });

    it("should default to 1 hour in ModificationTokenService if env var is invalid", async () => {
        process.env.PAYMENT_CAPTURE_DELAY_MS = "not-a-number";
        const { ModificationTokenService } = await import("../../src/services/modification-token");
        const service = new ModificationTokenService();
        // Falls back to default when env var is non-numeric
        expect((service as any).windowSeconds).toBe(3600);
    });
});
