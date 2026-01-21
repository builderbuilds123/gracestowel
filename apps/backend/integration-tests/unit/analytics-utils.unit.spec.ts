import { describe, expect, it } from "vitest";
import { maskProperties, normalizeEventName } from "../../src/utils/analytics";

describe("analytics utils", () => {
  it("masks email/phone-like values and sensitive keys", () => {
    const input = {
      email: "a@b.com",
      token: "secret",
      message: "call 555-123-4567",
      nested: { phone: "+1 (415) 555-0000" },
    };
    const masked = maskProperties(input);
    expect(masked.email).not.toBe("a@b.com");
    expect(masked.token).not.toBe("secret");
    expect(String(masked.message)).not.toContain("555-123-4567");
    expect((masked.nested as { phone: string }).phone).not.toBe("+1 (415) 555-0000");
  });

  it("normalizes events to domain.action", () => {
    expect(normalizeEventName("order_placed")).toBe("order.placed");
  });
});
