import { describe, it, expect } from "vitest";
import { validateShippingMethods } from "../create-order-from-stripe";

describe("validateShippingMethods", () => {
  it("returns normalized methods when option id and provider data are present", () => {
    const result = validateShippingMethods([
      {
        shipping_option_id: "so_test",
        name: "Express",
        amount: 1500,
        data: { service_code: "EXP" },
      },
    ]);

    expect(result).toEqual([
      {
        shipping_option_id: "so_test",
        name: "Express",
        amount: 1500,
        data: { service_code: "EXP" },
      },
    ]);
  });

  it("throws when shipping_option_id is missing", () => {
    expect(() =>
      validateShippingMethods([
        {
          shipping_option_id: undefined,
          name: "Express",
          amount: 1500,
          data: { service_code: "EXP" },
        },
      ] as any)
    ).toThrow("shipping_option_id");
  });

  it("throws when provider data is missing", () => {
    expect(() =>
      validateShippingMethods([
        {
          shipping_option_id: "so_test",
          name: "Express",
          amount: 1500,
          data: undefined,
        },
      ] as any)
    ).toThrow("provider data");
  });

  it("ignores null entries before validation", () => {
    const result = validateShippingMethods([
      null,
      {
        shipping_option_id: "so_test",
        name: "Express",
        amount: 1500,
        data: { service_code: "EXP" },
      },
    ] as any);

    expect(result).toHaveLength(1);
    expect(result[0].shipping_option_id).toBe("so_test");
  });
});
