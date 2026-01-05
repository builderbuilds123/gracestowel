import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryDecrementService, InventoryAdjustment } from "../../src/services/inventory-decrement-logic";
import { InsufficientStockError } from "../../src/workflows/add-item-to-order";
import { clampAvailability } from "../../src/lib/inventory/availability";

describe("InventoryDecrementService", () => {
    let service: InventoryDecrementService;
    let query: any;
    let logger: any;
    let pgConnection: any;

    beforeEach(() => {
        query = {
            graph: vi.fn(),
        };

        logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        };

        // Mock knex-like interface
        pgConnection = vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            whereIn: vi.fn().mockReturnThis(), // Added for batching
            select: vi.fn().mockResolvedValue([{ id: "level_pref", allow_backorder: false }]),
        });

        service = new InventoryDecrementService({ logger, query, pg_connection: pgConnection });
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
                return { 
                    data: [
                        { id: "variant_1", inventory_items: [{ inventory_item_id: "inv_variant_1" }] },
                        { id: "variant_2", inventory_items: [{ inventory_item_id: "inv_variant_2" }] }
                    ] 
                };
            }
            if (entity === "inventory_level") {
                if (filters.inventory_item_id.includes("inv_variant_1")) {
                     // Simplified mock return for batch query handling
                     // In real batched query, it returns flat list.
                     // But here we need to simulate the result of the query.graph call which wraps data
                     // Note: The service now filters locally.
                     
                     // We'll return levels for both items
                     return {
                        data: [
                            { id: "level_pref", location_id: "loc_pref", stocked_quantity: 5, inventory_item_id: "inv_variant_1" },
                            { id: "level_other", location_id: "loc_other", stocked_quantity: 10, inventory_item_id: "inv_variant_1" },
                            { id: "level_pref_2", location_id: "loc_pref", stocked_quantity: 1, inventory_item_id: "inv_variant_2" },
                            { id: "level_other_2", location_id: "loc_other", stocked_quantity: 3, inventory_item_id: "inv_variant_2" },
                        ]
                     };
                }
                return { data: [] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_other" }] }] };
            }
            return { data: [] };
        });
        
        // Mock batch fetch result
        pgConnection.mockReturnValue({
            whereIn: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([
                { id: "level_pref", allow_backorder: false },
                { id: "level_pref_2", allow_backorder: false }
            ]),
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

    /**
     * AC2 & AC7: Non-backorder path rejects insufficient stock
     * AC7 specifically requires that reservation/availability checks run BEFORE decrement
     */
    it("blocks negative (backorder) when allow_backorder=false - AC7: checks run before decrement", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 3 }],
            preferredLocationIds: [],
            salesChannelId: "sc_1",
        };

        const stockLevel = { id: "level_b", location_id: "loc_b", stocked_quantity: 2, inventory_item_id: "inv_variant_1" };
        let pgConnectionCalled = false;

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ id: "variant_1", inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }
            if (entity === "inventory_level") {
                return { data: [stockLevel] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_b" }] }] };
            }
            return { data: [] };
        });

        // Mock pgConnection to track call and return false
        pgConnection.mockReturnValue({
            whereIn: vi.fn().mockReturnThis(),
            select: vi.fn().mockImplementation(async () => {
                pgConnectionCalled = true;
                return [{ id: "level_b", allow_backorder: false }];
            }),
        });

        // AC7: Verify error is thrown
        await expect(service.atomicDecrementInventory(input)).rejects.toThrow(InsufficientStockError);

        // AC7: Verify compliance
        expect(pgConnectionCalled).toBe(true);
    });

    it("allows negative (backorder) when allow_backorder=true", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_1", quantity: 3 }],
            preferredLocationIds: [],
            salesChannelId: "sc_1",
        };

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ id: "variant_1", inventory_items: [{ inventory_item_id: "inv_variant_1" }] }] };
            }
            if (entity === "inventory_level") {
                return { data: [{ id: "level_b", location_id: "loc_b", stocked_quantity: 2, inventory_item_id: "inv_variant_1" }] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_b" }] }] };
            }
            return { data: [] };
        });

        // Mock return true
        pgConnection.mockReturnValue({
            whereIn: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([{ id: "level_b", allow_backorder: true }]),
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

        // For valid item structure check
        // The service now pre-validates. Then fetches variants.
        // If variant not found or no inventory item, it throws.
        
        query.graph.mockResolvedValue({ data: [] });

        // If map lookup fails it throws InsufficientStockError
        await expect(service.atomicDecrementInventory(input)).rejects.toThrow();
    });

    it("provides correct adjustment data for backorder event emission (AC5c)", async () => {
        const input = {
            cartItems: [{ variant_id: "variant_backorder", quantity: 5 }],
            preferredLocationIds: [],
            salesChannelId: "sc_1",
        };

        query.graph.mockImplementation(async ({ entity, filters }: any) => {
            if (entity === "product_variant") {
                return { data: [{ id: "variant_backorder", inventory_items: [{ inventory_item_id: "inv_backorder" }] }] };
            }
            if (entity === "inventory_level") {
                return { data: [{ id: "level_backorder", location_id: "loc_backorder", stocked_quantity: 2, inventory_item_id: "inv_backorder" }] };
            }
            if (entity === "sales_channel") {
                return { data: [{ id: "sc_1", stock_locations: [{ stock_location_id: "loc_backorder" }] }] };
            }
            return { data: [] };
        });

        // Enable backorder
        pgConnection.mockReturnValue({
            whereIn: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue([{ id: "level_backorder", allow_backorder: true }]),
        });

        const adjustments = await service.atomicDecrementInventory(input);

        expect(adjustments).toHaveLength(1);
        const adj = adjustments[0];

        // AC3: Required fields
        expect(adj.variant_id).toBe("variant_backorder");
        expect(adj.inventory_item_id).toBe("inv_backorder");
        expect(adj.location_id).toBe("loc_backorder");

        const expectedDelta = adj.previous_stocked_quantity - adj.stocked_quantity;
        expect(expectedDelta).toBe(5);

        expect(adj.stocked_quantity).toBe(-3);
        expect(adj.available_quantity).toBe(0);
        expect(adj.previous_stocked_quantity).toBe(2);
    });

    it("throws error for invalid quantities (zero)", async () => {
        const input = {
            cartItems: [{ variant_id: "v1", quantity: 0 }],
        };
        await expect(service.atomicDecrementInventory(input)).rejects.toThrow("Invalid quantity");
    });
    
    it("throws error for invalid quantities (negative)", async () => {
        const input = {
            cartItems: [{ variant_id: "v1", quantity: -5 }],
        };
        await expect(service.atomicDecrementInventory(input)).rejects.toThrow("Invalid quantity");
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
