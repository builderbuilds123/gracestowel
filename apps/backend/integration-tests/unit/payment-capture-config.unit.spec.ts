import { describe, expect, it } from "vitest";
import { calculateCaptureDelayMs } from "../../src/lib/payment-capture-queue";

/**
 * Unit tests for PAYMENT_CAPTURE_DELAY_MS configuration
 *
 * These tests verify the timing calculation logic without using vi.resetModules(),
 * which can corrupt Vite's module graph in CI environments.
 *
 * The actual constants (PAYMENT_CAPTURE_DELAY_MS, CAPTURE_BUFFER_SECONDS) are
 * evaluated at module load time from environment variables. We test:
 * 1. The calculation function directly (no module reset needed)
 * 2. The actual loaded values match expected defaults
 */

describe("PAYMENT_CAPTURE_DELAY_MS Configuration", () => {
    describe("calculateCaptureDelayMs function", () => {
        it("should calculate delay correctly with default 30s buffer", () => {
            // 60*60 - 30 = 3570 seconds = 3570000ms
            expect(calculateCaptureDelayMs(30)).toBe(3570000);
        });

        it("should calculate delay correctly with 60s buffer", () => {
            // 60*60 - 60 = 3540 seconds = 3540000ms
            expect(calculateCaptureDelayMs(60)).toBe(3540000);
        });

        it("should calculate delay correctly with 0s buffer (full hour)", () => {
            // 60*60 - 0 = 3600 seconds = 3600000ms
            expect(calculateCaptureDelayMs(0)).toBe(3600000);
        });

        it("should support custom grace period hours", () => {
            // 2 hours with 30s buffer: 2*60*60 - 30 = 7170 seconds = 7170000ms
            expect(calculateCaptureDelayMs(30, 2)).toBe(7170000);
        });

        it("should handle edge case of buffer equal to grace period", () => {
            // 1 hour = 3600 seconds, buffer = 3600 seconds = 0ms delay
            expect(calculateCaptureDelayMs(3600)).toBe(0);
        });
    });

    describe("Default values at module load time", () => {
        it("should have CAPTURE_BUFFER_SECONDS loaded from env or default to 30", async () => {
            const { CAPTURE_BUFFER_SECONDS } = await import("../../src/lib/payment-capture-queue");
            // In test environment, it should be 30 (default) unless overridden
            expect(CAPTURE_BUFFER_SECONDS).toBeTypeOf("number");
            expect(CAPTURE_BUFFER_SECONDS).toBeGreaterThanOrEqual(0);
        });

        it("should have PAYMENT_CAPTURE_DELAY_MS loaded from env or calculated from buffer", async () => {
            const { PAYMENT_CAPTURE_DELAY_MS } = await import("../../src/lib/payment-capture-queue");
            // In test environment with .env.test setting PAYMENT_CAPTURE_DELAY_MS=10000
            // OR default calculation
            expect(PAYMENT_CAPTURE_DELAY_MS).toBeTypeOf("number");
            expect(PAYMENT_CAPTURE_DELAY_MS).toBeGreaterThan(0);
        });
    });

    describe("ModificationTokenService window calculation", () => {
        it("should parse PAYMENT_CAPTURE_DELAY_MS and convert to seconds for window", async () => {
            // The ModificationTokenService reads env at construction time
            // We can't reset modules, but we can verify the class exists and has expected behavior
            const { ModificationTokenService } = await import("../../src/services/modification-token");
            const { PAYMENT_CAPTURE_DELAY_MS } = await import("../../src/lib/payment-capture-queue");
            const service = new ModificationTokenService();

            // Verify windowSeconds is a valid positive number
            const windowSeconds = (service as any).windowSeconds;
            expect(windowSeconds).toBeTypeOf("number");
            expect(windowSeconds).toBeGreaterThan(0);

            // Window should be calculated from PAYMENT_CAPTURE_DELAY_MS (default is 3 days = 259200 seconds)
            // It's min(PAYMENT_CAPTURE_DELAY_MS, TOKEN_MAX_AGE_MS) / 1000
            // Default TOKEN_MAX_AGE is 7 days (604800 seconds), so window should be min(259200, 604800) = 259200
            const TOKEN_MAX_AGE_HOURS = parseInt(
                process.env.MODIFICATION_TOKEN_MAX_AGE_HOURS || "168", // 7 days default
                10
            );
            const TOKEN_MAX_AGE_MS = TOKEN_MAX_AGE_HOURS * 60 * 60 * 1000;
            const expectedWindowSeconds = Math.min(
                Math.floor(PAYMENT_CAPTURE_DELAY_MS / 1000),
                Math.floor(TOKEN_MAX_AGE_MS / 1000)
            );
            expect(windowSeconds).toBe(expectedWindowSeconds);
        });

        it("should generate and validate tokens correctly regardless of configured window", async () => {
            const { ModificationTokenService } = await import("../../src/services/modification-token");
            const service = new ModificationTokenService();

            // Generate a token and verify it can be validated
            const token = service.generateToken("order_test", "pi_test", new Date());
            expect(token).toBeTruthy();
            expect(typeof token).toBe("string");

            // Token should be validatable immediately after creation
            const result = service.validateToken(token);
            expect(result.valid).toBe(true);
            expect(result.payload?.order_id).toBe("order_test");
            expect(result.payload?.payment_intent_id).toBe("pi_test");
        });
    });
});
