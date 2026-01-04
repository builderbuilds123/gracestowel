import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryDecrementService } from "../../src/services/inventory-decrement-logic";
import { InsufficientStockError } from "../../src/workflows/add-item-to-order";

describe("InventoryDecrementService", () => {
    let service: InventoryDecrementService;
    let container: any;
    let query: any;
    let logger: any;

    beforeEach(() => {
        query = {
            graph: vi.fn(),
        };

        logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        };

        service = new InventoryDecrementService({ logger, query });
    });

    it("uses shipping preferred location when provided", async () => {
        const input = {
            cartItems: [
                { variant_id: "variant_1", quantity: 2 },
                { variant_id: "variant_2", quantity: 1 },
            ],
            preferredLocationIds: ["loc_pref"],
            salesChannelId: "sc_1",
        };

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: `inv_${filters.id}` }] }] };
            }
            if (entity === "inventory_level") {
                if (filters.inventory_item_id === "inv_variant_1") {
                    return {
                        data: [
                            { id: "level_pref", location_id: "loc_pref", stocked_quantity: 5 },
                            { id: "level_other", location_id: "loc_other", stocked_quantity: 10 },
                        ],
                    };
                }
                return {
                    data: [
                        { id: "level_pref_2", location_id: "loc_pref", stocked_quantity: 1 },
                        { id: "level_other_2", location_id: "loc_other", stocked_quantity: 3 },
                    ],
                };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_other" }] }] };
            }
            return { data: [] };
        });

        const adjustments = await service.atomicDecrementInventory(input);

        expect(adjustments).toEqual([
            {
                inventory_item_id: "inv_variant_1",
                location_id: "loc_pref",
                stocked_quantity: 3,
                previous_stocked_quantity: 5,
            },
            {
                inventory_item_id: "inv_variant_2",
                location_id: "loc_pref",
                stocked_quantity: 0,
                previous_stocked_quantity: 1,
            },
        ]);
    });

    it("falls back to sales channel locations and allows negative (backorder)", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 3 }],
            preferredLocationIds: [],
            salesChannelId: "sc_1",
        };

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }
            if (entity === "inventory_level") {
                return {
                    data: [
                        { id: "level_a", location_id: "loc_a", stocked_quantity: 1 },
                        { id: "level_b", location_id: "loc_b", stocked_quantity: 2 },
                    ],
                };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_b" }] }] };
            }
            return { data: [] };
        });

        const adjustments = await service.atomicDecrementInventory(input);

        expect(adjustments[0]).toEqual({
            inventory_item_id: "inv_variant_1",
            location_id: "loc_b",
            stocked_quantity: -1, // backorder allowed
            previous_stocked_quantity: 2,
        });
    });

    it("throws when no inventory item mapping exists", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_missing", quantity: 1 }],
            preferredLocationIds: [],
            salesChannelId: null,
        };

        query.graph.mockResolvedValue({ data: [] });

        await expect(service.atomicDecrementInventory(input)).rejects.toBeInstanceOf(InsufficientStockError);
    });
});
