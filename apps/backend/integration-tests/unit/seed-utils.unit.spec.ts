import { describe, it, expect } from "vitest";
import { buildProductUpdate } from "../../src/scripts/seed-utils";

const productsToCreate = [
  {
    handle: "the-nuzzle",
    title: "The Nuzzle",
    images: [{ url: "/uploads/nuzzle-cloud-white-01.png" }],
    metadata: { features: "Soft" },
  },
];

describe("buildProductUpdate", () => {
  it("includes title for existing products", () => {
    const update = buildProductUpdate(
      { id: "prod_1", handle: "the-nuzzle" },
      productsToCreate
    );

    expect(update).toEqual(
      expect.objectContaining({
        title: "The Nuzzle",
      })
    );
  });
});
