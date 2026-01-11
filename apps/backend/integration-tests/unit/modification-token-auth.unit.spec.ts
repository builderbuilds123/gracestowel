
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 60000 });
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// Mocks
const mockModificationTokenService = {
  validateToken: vi.fn(),
  getRemainingTime: vi.fn()
};

vi.mock("../../src/services/modification-token", () => ({
  modificationTokenService: mockModificationTokenService
}));
vi.mock("../../src/services/modification-token.ts", () => ({
  modificationTokenService: mockModificationTokenService
}));

const mockOrderService = {
  updateOrders: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn()
};

const mockQueryGraph = vi.fn();

// Mocks for workflows definition
const mockRun = vi.fn().mockResolvedValue({ 
  result: { 
    order: { id: "ord_123" }, 
    payment_status: "authorized",
    orderId: "ord_123",
    newTotal: 1000,
    quantityDiff: 1
  } 
});

const mockAddItemToOrderWorkflow = vi.fn(() => ({ run: mockRun }));
const mockUpdateLineItemQuantityWorkflow = vi.fn(() => ({ run: mockRun }));

vi.mock("../../src/workflows/add-item-to-order", () => ({
  addItemToOrderWorkflow: mockAddItemToOrderWorkflow
}));
vi.mock("../../src/workflows/add-item-to-order.ts", () => ({
  addItemToOrderWorkflow: mockAddItemToOrderWorkflow
}));

vi.mock("../../src/workflows/update-line-item-quantity", () => ({
  updateLineItemQuantityWorkflow: mockUpdateLineItemQuantityWorkflow
}));
vi.mock("../../src/workflows/update-line-item-quantity.ts", () => ({
  updateLineItemQuantityWorkflow: mockUpdateLineItemQuantityWorkflow
}));

// Import handlers dynamically to ensure mocks apply
// We will import in tests or setup

describe("Modification Token Auth", () => {
  let addressRoute: any;
  let lineItemsRoute: any;
  let lineItemsUpdateRoute: any;
  let cancelRoute: any;

  beforeAll(async () => {
    // Import handlers once
    addressRoute = await import("../../src/api/store/orders/[id]/address/route.ts");
    lineItemsRoute = await import("../../src/api/store/orders/[id]/line-items/route.ts");
    lineItemsUpdateRoute = await import("../../src/api/store/orders/[id]/line-items/update/route.ts");
    cancelRoute = await import("../../src/api/store/orders/[id]/cancel/route.ts");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  const createMockReqRes = (headers: any = {}, body: any = {}, params: any = { id: "ord_123" }) => {
    const req = {
      headers,
      body,
      params,
      scope: {
        resolve: vi.fn((name) => {
          if (name === "order") return mockOrderService;
          if (name === "query") return { graph: mockQueryGraph };
          return {};
        })
      }
    } as unknown as MedusaRequest;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as MedusaResponse;

    return { req, res };
  };

  describe("API Consistency & Security", () => {
    const routes = [
      { name: "Address Update", handler: () => addressRoute.POST, type: "inline" },
      { name: "Add Line Item", handler: () => lineItemsRoute.POST, type: "workflow-add" },
      { name: "Update Line Item", handler: () => lineItemsUpdateRoute.POST, type: "workflow-update" },
      { name: "Cancel Order", handler: () => cancelRoute.POST, type: "inline" }
    ];

    routes.forEach(({ name, handler, type }) => {
      describe(name, () => {
        it("should reject request when token is missing in header", async () => {
          const { req, res } = createMockReqRes({}, { address: {}, item_id: "itm_1", quantity: 1, variant_id: "var_1" });
          await handler()(req, res);
          
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "TOKEN_REQUIRED",
            message: expect.stringContaining("header is required")
          }));
        });

        it("should reject request when token is in body instead of header (Fail-Loud)", async () => {
          const { req, res } = createMockReqRes({}, { 
            modification_token: "valid_token", // In body
            address: {},
            item_id: "itm_1", quantity: 1, variant_id: "var_1"
          });
          await handler()(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "TOKEN_REQUIRED",
            message: expect.stringContaining("Token must be sent in header")
          }));
        });

        it("should accept request when token is in header", async () => {
          const { req, res } = createMockReqRes(
            { "x-modification-token": "valid_token" }, 
            { 
               // generic body valid for most endpoints to pass validation before token check
               address: { first_name: "Test", last_name: "User", address_1: "123 St", city: "City", postal_code: "12345", country_code: "us" },
               item_id: "itm_1",
               variant_id: "var_123",  // for line-items
               quantity: 2 // for update (overrides if needed)
            }
          );
          
          // Mock validation success
          mockModificationTokenService.validateToken.mockReturnValue({ 
            valid: true, 
            payload: { order_id: "ord_123" } 
          });
          mockModificationTokenService.getRemainingTime.mockReturnValue(100);
          
          mockQueryGraph.mockResolvedValue({ 
            data: [{ id: "ord_123", status: "pending", shipping_address: {} }] 
          });

          // Mock order service responses
          mockOrderService.updateOrders.mockResolvedValue({});
          
          await handler()(req, res);
          
          // Check that status was NOT 400 TOKEN_REQUIRED
          const statusCalls = (res.status as any).mock.calls;
          const jsonCalls = (res.json as any).mock.calls;
          
          if(statusCalls.length > 0 && statusCalls[0][0] === 400 && jsonCalls[0][0].code === "TOKEN_REQUIRED") {
             throw new Error("Rejected valid header token");
          }
          
          // Assertion depends on implementation type
          if (type === "inline") {
            expect(mockModificationTokenService.validateToken).toHaveBeenCalledWith("valid_token");
          } else if (type === "workflow-add") {
             expect(mockAddItemToOrderWorkflow).toHaveBeenCalled();
             expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
               input: expect.objectContaining({ modificationToken: "valid_token" })
             }));
          } else if (type === "workflow-update") {
             expect(mockUpdateLineItemQuantityWorkflow).toHaveBeenCalled();
             expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
               input: expect.objectContaining({ modificationToken: "valid_token" })
             }));
          }
        });
      });
    });
  });
});
