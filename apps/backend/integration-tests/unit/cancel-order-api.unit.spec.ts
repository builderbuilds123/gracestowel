/**
 * Unit tests for the Cancel Order API Route
 * Verifies token extraction from header and error handling
 */
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { POST } from "../../src/api/store/orders/[id]/cancel/route";
import { modificationTokenService } from "../../src/services/modification-token";
import * as workflowExports from "../../src/workflows/cancel-order-with-refund";

// Mock dependencies
jest.mock("../../src/services/modification-token");
jest.mock("../../src/workflows/cancel-order-with-refund", () => ({
    cancelOrderWithRefundWorkflow: jest.fn().mockReturnValue({
        run: jest.fn().mockResolvedValue({
            result: {
                order_id: "ord_123",
                status: "canceled",
                payment_action: "voided",
            },
        }),
    }),
    LateCancelError: class LateCancelError extends Error {},
    PartialCaptureError: class PartialCaptureError extends Error {},
    OrderAlreadyCanceledError: class OrderAlreadyCanceledError extends Error {},
    QueueRemovalError: class QueueRemovalError extends Error {},
}));

describe("Cancel Order API Route", () => {
    let req: Partial<MedusaRequest>;
    let res: Partial<MedusaResponse>;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    let queryGraphMock: jest.Mock;

    beforeEach(() => {
        jsonMock = jest.fn();
        statusMock = jest.fn().mockReturnValue({ json: jsonMock });
        queryGraphMock = jest.fn().mockResolvedValue({
            data: [{ id: "ord_123", status: "pending", metadata: {} }]
        });
        
        res = {
            status: statusMock,
        };
        req = {
            params: { id: "ord_123" },
            body: { reason: "Changed mind" },
            headers: {},
            scope: {
                resolve: jest.fn().mockReturnValue({
                    graph: queryGraphMock
                })
            }
        };
        jest.clearAllMocks();
    });

    it("should extract token from x-modification-token header", async () => {
        req.headers = { "x-modification-token": "valid_token" };
        
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: true,
            payload: { order_id: "ord_123" },
        });

        await POST(req as MedusaRequest, res as MedusaResponse);

        expect(modificationTokenService.validateToken).toHaveBeenCalledWith("valid_token");
        expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("should return 400 if token is missing from header", async () => {
        req.headers = {}; // No token header
        
        await POST(req as MedusaRequest, res as MedusaResponse);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
            code: "TOKEN_REQUIRED"
        }));
    });

    it("should use body for reason but header for token", async () => {
        req.headers = { "x-modification-token": "valid_token" };
        req.body = { reason: "Too expensive", token: "ignored_body_token" };
        
        (modificationTokenService.validateToken as jest.Mock).mockReturnValue({
            valid: true,
            payload: { order_id: "ord_123" },
        });

        await POST(req as MedusaRequest, res as MedusaResponse);

        // Should use header token, not body token (though in this test they are different strings to prove it)
        expect(modificationTokenService.validateToken).toHaveBeenCalledWith("valid_token");
    });
});
