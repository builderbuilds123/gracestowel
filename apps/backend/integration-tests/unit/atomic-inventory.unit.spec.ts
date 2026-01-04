import { describe, it, expect, vi, beforeEach } from "vitest";
import { atomicDecrementInventory } from "../../src/workflows/create-order-from-stripe";
import { InsufficientStockError } from "../../src/workflows/add-item-to-order";

describe("atomicDecrementInventory", () => {
    let container: any;
    let manager: any;
    let query: any;
    let knexBuilder: any;
    let updateMock: any;

    beforeEach(() => {
        updateMock = vi.fn().mockResolvedValue([{ id: "row" }]);
        knexBuilder = {
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            update: updateMock,
        };

        manager = {
            knex: vi.fn().mockReturnValue(knexBuilder),
        };

        manager.knex.raw = vi.fn((sql, bindings) => ({ sql, bindings }));
        manager.knex.fn = { now: vi.fn(() => "now()") };

        query = {
            graph: vi.fn(),
        };

        container = {
            resolve: vi.fn((key) => {
                if (key === "manager") return manager;
                if (key === "query") return query;
                return null;
            }),
        };
    });

    it("atomically decrements inventory with preferred locations", async () => {
        const input = {
            cartItems: [
                { variant_id: "variant_1", quantity: 2 },
                { variant_id: "variant_2", quantity: 1 },
            ],
            preferredLocationIds: ["loc_pref"],
        };

        query.graph.mockImplementation(
            async ({
                entity,
                filters,
            }: { entity: string; filters?: { id?: string } }) => {
            if (entity === "product_variant") {
                return {
                    data: [
                        { inventory_items: [{ inventory_item_id: `inv_${filters?.id ?? "unknown"}` }] },
                    ],
                };
            }

            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_pref", location_id: "loc_pref", stocked_quantity: 5 },
                        { id: "level_other", location_id: "loc_other", stocked_quantity: 10 },
                    ],
                };
            }

            return { data: [] };
        });

        const adjustments = await atomicDecrementInventory(input, container);

        expect(updateMock).toHaveBeenCalledTimes(2);
        expect(knexBuilder.where).toHaveBeenCalledWith({
            inventory_item_id: "inv_variant_1",
            location_id: "loc_pref",
        });
        expect(adjustments).toEqual([
            { inventoryItemId: "inv_variant_1", locationId: "loc_pref", quantity: 2 },
            { inventoryItemId: "inv_variant_2", locationId: "loc_pref", quantity: 1 },
        ]);
    });

    it("throws InsufficientStockError when available stock is insufficient", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 3 }],
            preferredLocationIds: [],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                return { data: [{ id: "level_1", location_id: "loc_1", stocked_quantity: 1 }] };
            }

            return { data: [] };
        });

        await expect(atomicDecrementInventory(input, container)).rejects.toBeInstanceOf(InsufficientStockError);
        expect(updateMock).not.toHaveBeenCalled();
    });

    it("uses the single available location when only one exists", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 1 }],
            preferredLocationIds: [],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_single", location_id: "loc_single", stocked_quantity: 3 },
                    ],
                };
            }

            return { data: [] };
        });

        const adjustments = await atomicDecrementInventory(input, container);

        expect(updateMock).toHaveBeenCalledTimes(1);
        expect(knexBuilder.where).toHaveBeenCalledWith({
            inventory_item_id: "inv_variant_1",
            location_id: "loc_single",
        });
        expect(adjustments).toEqual([
            { inventoryItemId: "inv_variant_1", locationId: "loc_single", quantity: 1 },
        ]);
    });

    it("throws when preferred location is not found among inventory levels", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 1 }],
            preferredLocationIds: ["loc_missing"],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_a", location_id: "loc_a", stocked_quantity: 5 },
                    ],
                };
            }

            return { data: [] };
        });

        await expect(atomicDecrementInventory(input, container)).rejects.toBeInstanceOf(InsufficientStockError);
        expect(updateMock).not.toHaveBeenCalled();
    });

    it("throws when multiple locations exist but no preferred location is provided", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 1 }],
            preferredLocationIds: [],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_a", location_id: "loc_a", stocked_quantity: 5 },
                        { id: "level_b", location_id: "loc_b", stocked_quantity: 4 },
                    ],
                };
            }

            return { data: [] };
        });

        await expect(atomicDecrementInventory(input, container)).rejects.toThrow(
            /No stock_location_id provided/
        );
        expect(updateMock).not.toHaveBeenCalled();
    });

    /**
     * AC1 Test: Simulates concurrent access where two customers try to buy the last item.
     * The atomic SQL guard (WHERE stocked_quantity >= X) ensures only ONE succeeds.
     *
     * This test verifies that when the database UPDATE returns 0 rows (because another
     * transaction already decremented the stock), an InsufficientStockError is thrown.
     */
    it("throws InsufficientStockError when concurrent update fails (AC1: atomic reservation)", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 1 }],
            preferredLocationIds: [],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                // Stock shows 1 available (before concurrent decrement)
                return {
                    data: [
                        { id: "level_1", location_id: "loc_1", stocked_quantity: 1 },
                    ],
                };
            }

            return { data: [] };
        });

        // Simulate concurrent update failure: UPDATE returns 0 rows because
        // another transaction already decremented stocked_quantity to 0
        updateMock.mockResolvedValue([]);

        await expect(atomicDecrementInventory(input, container)).rejects.toBeInstanceOf(InsufficientStockError);

        // Verify the atomic guard was applied
        expect(knexBuilder.andWhere).toHaveBeenCalledWith("stocked_quantity", ">=", 1);
        expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it("verifies atomic SQL guard is applied with correct quantity", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 5 }],
            preferredLocationIds: [],
        };

        query.graph.mockImplementation(async ({ entity }: { entity: string }) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }

            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_1", location_id: "loc_1", stocked_quantity: 10 },
                    ],
                };
            }

            return { data: [] };
        });

        await atomicDecrementInventory(input, container);

        // Verify the WHERE clause includes the atomic guard with exact quantity
        expect(knexBuilder.andWhere).toHaveBeenCalledWith("stocked_quantity", ">=", 5);

        // Verify the UPDATE uses raw SQL for atomic decrement
        expect(manager.knex.raw).toHaveBeenCalledWith("stocked_quantity - ?", [5]);
    });
});
