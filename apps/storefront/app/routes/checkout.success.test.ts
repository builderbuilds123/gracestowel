import { describe, expect, it } from "vitest";
import { loader } from "./checkout.success";

const buildContext = () => ({
    cloudflare: {
        env: {
            STRIPE_PUBLISHABLE_KEY: "pk_test_123",
            MEDUSA_BACKEND_URL: "https://api.example.com",
            MEDUSA_PUBLISHABLE_KEY: "medusa_pk",
        },
    },
});

describe("checkout.success loader", () => {
    it("strips sensitive query params via redirect and stores them in a short-lived cookie", async () => {
        const request = new Request(
            "https://example.com/checkout/success?payment_intent=pi_123&payment_intent_client_secret=sec_abc&redirect_status=succeeded"
        );

        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("https://example.com/checkout/success");
        const setCookie = response.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("checkout_params=");
        expect(setCookie).toContain("Max-Age=600");
        expect(setCookie).toContain("SameSite=Strict");
    });

    it("returns params from cookie and clears it", async () => {
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

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.initialParams).toEqual({
            paymentIntentId: "pi_abc",
            paymentIntentClientSecret: "sec_def",
            redirectStatus: "succeeded",
        });
        const setCookie = response.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("checkout_params=");
        expect(setCookie).toContain("Max-Age=0");
    });

    it("returns null params when none provided", async () => {
        const request = new Request("https://example.com/checkout/success");
        const response = await loader({ request, context: buildContext() } as any);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.initialParams).toBeNull();
    });
});
