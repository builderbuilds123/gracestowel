import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryDecrementService, InventoryAdjustment } from "../../src/services/inventory-decrement-logic";
import { InsufficientStockError } from "../../src/workflows/add-item-to-order";
import { clampAvailability } from "../../src/lib/inventory/availability";

describe("InventoryDecrementService", () => {
    let service: InventoryDecrementService;
    let query: any;
    let logger: any;
    let pg_connection: any;

    beforeEach(() => {
        query = {
            graph: vi.fn(),
        };

        logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        };

        pg_connection = vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([{ allow_backorder: false }]),
        });

        service = new InventoryDecrementService({ logger, query, pg_connection });
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
                variant_id: "variant_1",
                inventory_item_id: "inv_variant_1",
                location_id: "loc_pref",
                stocked_quantity: 3,
                previous_stocked_quantity: 5,
                available_quantity: 3,
            },
            {
                variant_id: "variant_2",
                inventory_item_id: "inv_variant_2",
                location_id: "loc_pref",
                stocked_quantity: 0,
                previous_stocked_quantity: 1,
                available_quantity: 0,
            },
        ]);
    });

    it("blocks negative (backorder) when allow_backorder=false", async () => {
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
                return { data: [{ id: "level_b", location_id: "loc_b", stocked_quantity: 2 }] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_b" }] }] };
            }
            return { data: [] };
        });

        // Default mock is allow_backorder: false
        await expect(service.atomicDecrementInventory(input)).rejects.toThrow(InsufficientStockError);
    });

    it("allows negative (backorder) when allow_backorder=true", async () => {
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
                return { data: [{ id: "level_b", location_id: "loc_b", stocked_quantity: 2 }] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_b" }] }] };
            }
            return { data: [] };
        });

        // Mock pg_connection to return true for this specific test
        pg_connection.mockReturnValue({
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([{ allow_backorder: true }]),
        });

        const adjustments = await service.atomicDecrementInventory(input);

        expect(adjustments[0]).toEqual({
            variant_id: "variant_1",
            inventory_item_id: "inv_variant_1",
            location_id: "loc_b",
            stocked_quantity: -1, 
            previous_stocked_quantity: 2,
            available_quantity: 0,
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

    /**
     * AC5(c): Backorder event fires when result < 0
     * This test verifies that adjustment data for backordered items contains:
     * - negative stocked_quantity (indicating backorder)
     * - correct previous_stocked_quantity for delta calculation
     * - available_quantity clamped to 0
     *
     * The actual event emission happens in the workflow (create-order-from-stripe.ts)
     * which transforms these adjustments into the inventory.backordered event payload.
     */
    it("provides correct adjustment data for backorder event emission (AC5c)", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_backorder", quantity: 5 }],
            preferredLocationIds: [],
            salesChannelId: "sc_1",
        };

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ inventory_items: [{ inventory_item_id: "inv_backorder" }] }] };
            }
            if (entity === "inventory_level") {
                return { data: [{ id: "level_backorder", location_id: "loc_backorder", stocked_quantity: 2 }] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_backorder" }] }] };
            }
            return { data: [] };
        });

        // Enable backorder for this test
        pg_connection.mockReturnValue({
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([{ allow_backorder: true }]),
        });

        const adjustments = await service.atomicDecrementInventory(input);

        // Verify adjustment contains all data needed for backorder event (AC3)
        expect(adjustments).toHaveLength(1);
        const adj = adjustments[0];

        // AC3: Required fields for inventory.backordered event
        expect(adj.variant_id).toBe("variant_backorder");
        expect(adj.inventory_item_id).toBe("inv_backorder");
        expect(adj.location_id).toBe("loc_backorder");

        // AC3: delta calculation (previous - new = 2 - (-3) = 5)
        const expectedDelta = adj.previous_stocked_quantity - adj.stocked_quantity;
        expect(expectedDelta).toBe(5); // quantity requested

        // AC3: new_stock is negative (backorder condition)
        expect(adj.stocked_quantity).toBe(-3); // 2 - 5 = -3
        expect(adj.stocked_quantity).toBeLessThan(0);

        // AC4: available_quantity clamped to 0 for storefront
        expect(adj.available_quantity).toBe(0);
        expect(adj.previous_stocked_quantity).toBe(2);
    });
});

/**
 * Unit tests for clampAvailability helper
 * AC4 (INV-02): Storefront availability masking
 */
describe("clampAvailability", () => {
    it("returns positive values unchanged", () => {
        expect(clampAvailability(10)).toBe(10);
        expect(clampAvailability(1)).toBe(1);
        expect(clampAvailability(100)).toBe(100);
    });

    it("clamps negative values to 0 (AC4)", () => {
        expect(clampAvailability(-1)).toBe(0);
        expect(clampAvailability(-10)).toBe(0);
        expect(clampAvailability(-100)).toBe(0);
    });

    it("returns 0 for zero", () => {
        expect(clampAvailability(0)).toBe(0);
    });

    it("handles null and undefined", () => {
        expect(clampAvailability(null)).toBe(0);
        expect(clampAvailability(undefined)).toBe(0);
    });
});
