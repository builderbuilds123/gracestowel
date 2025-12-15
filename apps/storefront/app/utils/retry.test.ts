import { describe, it, expect, vi } from "vitest";
import { retry } from "./retry";

describe("retry", () => {
  it("should resolve immediately if function succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await retry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry if function fails", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const result = await retry(fn, 3, 10);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw if all retries fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(retry(fn, 3, 10)).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
