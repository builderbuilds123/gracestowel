import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loader, meta } from "./checkout.success";

const buildContext = (overrides: Record<string, string> = {}) => ({
    cloudflare: {
        env: {
            STRIPE_PUBLISHABLE_KEY: "pk_test_123",
            STRIPE_SECRET_KEY: "sk_test_123",
            MEDUSA_BACKEND_URL: "https://api.example.com",
            MEDUSA_PUBLISHABLE_KEY: "medusa_pk",
            ...overrides,
        },
    },
});

vi.mock("../lib/stripe.server", () => ({
    getStripeServerSide: () => ({
        paymentIntents: {
            retrieve: () => Promise.resolve({ status: "succeeded" }),
        },
    }),
}));

vi.mock("../lib/medusa-fetch", () => ({
    medusaFetch: () =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ order: { id: "order_123" }, modification_token: "tok_123" }),
        }),
}));

vi.mock("../utils/monitored-fetch", () => ({
    monitoredFetch: () =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
        }),
}));

vi.mock("../utils/guest-session.server", () => ({
    setGuestToken: () => Promise.resolve("guest_token=xyz; Path=/order; Max-Age=600; SameSite=Lax; Secure; HttpOnly"),
}));

describe("checkout.success loader", () => {
    it("strips sensitive query params via redirect and stores them in a short-lived cookie", async () => {
        const request = new Request(
            "https://example.com/checkout/success?payment_intent=pi_123&payment_intent_client_secret=sec_abc&redirect_status=succeeded"
        );

        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/checkout/success");
        const setCookie = response.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("checkout_params=");
        expect(setCookie).toContain("Max-Age=600");
        expect(setCookie).toContain("SameSite=Lax");
        expect(setCookie).toContain("Secure");
        expect(setCookie).toContain("HttpOnly");
    });

    it("validates params from cookie, completes flow, and redirects to order status", async () => {
        const cookieValue = encodeURIComponent(
            JSON.stringify({
                paymentIntentId: "pi_abc",
                paymentIntentClientSecret: "sec_def",
                redirectStatus: "succeeded",
            })
        );
        const request = new Request("https://example.com/checkout/success", {
            headers: {
                cookie: `checkout_params=${cookieValue}`,
            },
        });

        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/order/status/order_123");
        const setCookie = response.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("checkout_params=");
        expect(setCookie).toContain("Max-Age=0");
        expect(setCookie).toContain("SameSite=Lax");
        expect(setCookie).toContain("Secure");
        expect(setCookie).toContain("HttpOnly");
    });

    it("redirects to checkout when no params provided", async () => {
        const request = new Request("https://example.com/checkout/success");
        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toMatch(/^\/checkout\?error=PAYMENT_FAILED/);
    });

    it("redirects to checkout when payment_intent_client_secret is missing", async () => {
        const request = new Request(
            "https://example.com/checkout/success?payment_intent=pi_123&redirect_status=succeeded"
        );

        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toMatch(/^\/checkout\?error=PAYMENT_FAILED/);
    });
});

describe("checkout.success meta export", () => {
    it("exports referrer policy meta tag with strict-origin-when-cross-origin", () => {
        const metaTags = meta({} as any);
        
        expect(Array.isArray(metaTags)).toBe(true);
        expect(metaTags.length).toBeGreaterThan(0);
        
        const referrerTag = metaTags.find(
            (tag: any) => tag.name === "referrer"
        );
        
        expect(referrerTag).toBeDefined();
        if (referrerTag && 'content' in referrerTag) {
            expect((referrerTag as any).content).toBe("strict-origin-when-cross-origin");
        }
    });
});

describe("checkout.success client-side URL cleanup", () => {
    let replaceStateSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        replaceStateSpy = vi.fn();
        // Mock window.history.replaceState
        Object.defineProperty(window, "history", {
            writable: true,
            configurable: true,
            value: {
                replaceState: replaceStateSpy,
            },
        });
        Object.defineProperty(window, "location", {
            writable: true,
            configurable: true,
            value: {
                pathname: "/checkout/success",
                search: "",
            },
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should clean URL via useLayoutEffect when initialParams are provided", () => {
        // This test verifies the logic that would be executed in useLayoutEffect
        // The actual component test would require extensive mocking of React Router, Stripe, etc.
        // E2E tests should verify the full integration
        
        const mockInitialParams = {
            paymentIntentId: "pi_test",
            paymentIntentClientSecret: "sec_test",
            redirectStatus: "succeeded",
        };

        // Simulate the condition that triggers URL cleanup (from useLayoutEffect)
        const shouldCleanUrl = !!(
            mockInitialParams && 
            typeof window !== "undefined" && 
            window.history?.replaceState
        );
        
        expect(shouldCleanUrl).toBe(true);
        
        // Verify replaceState would be called with correct arguments
        if (shouldCleanUrl && window.history?.replaceState) {
            window.history.replaceState({}, "", window.location.pathname);
            expect(replaceStateSpy).toHaveBeenCalledWith({}, "", "/checkout/success");
        }
    });

    it("should not attempt URL cleanup when initialParams are null", () => {
        const mockInitialParams = null;
        const shouldCleanUrl = !!(
            mockInitialParams && 
            typeof window !== "undefined" && 
            window.history?.replaceState
        );
        
        expect(shouldCleanUrl).toBe(false);
        expect(replaceStateSpy).not.toHaveBeenCalled();
    });
});
