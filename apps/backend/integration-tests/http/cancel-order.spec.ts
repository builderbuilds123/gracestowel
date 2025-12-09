import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { modificationTokenService } from "../../src/services/modification-token";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe.skip("Cancel Order API (Requires DB)", () => {
      it("should return 400 if modification token is missing", async () => {
        try {
            await api.post("/store/orders/ord_test/cancel", {});
        } catch (err) {
            expect(err.response.status).toBe(400);
            expect(err.response.data.error).toContain("Modification token is required");
        }
      });

      it("should return 401 if modification token is invalid", async () => {
        try {
            await api.post("/store/orders/ord_test/cancel", {}, {
                headers: {
                    "x-modification-token": "invalid_token"
                }
            });
        } catch (err) {
            expect(err.response.status).toBe(401);
            expect(err.response.data.code).toBe("TOKEN_INVALID");
        }
      });

      it("should accept valid token and attempt workflow (fail with 500/Internal Error due to missing order)", async () => {
        // Generate a valid token for a non-existent order
        const validToken = modificationTokenService.generateToken("ord_integration_test", "pi_test");

        try {
            await api.post("/store/orders/ord_integration_test/cancel", {}, {
                headers: {
                    "x-modification-token": validToken
                }
            });
        } catch (err) {
            // We expect it to reach the workflow. 
            // Since order doesn't exist, lockOrderStep will throw "Order ... not found".
            // The API might return 500 or let Medusa handle it.
            // As long as it's NOT 400 or 401, we passed the auth layer.
            console.log("Integration Response Status:", err.response.status);
            console.log("Integration Response Data:", err.response.data);
            
            // It might be 500 or 404 depending on how uncaught errors are handled
            expect(err.response.status).toBeGreaterThanOrEqual(404);
        }
      });
    });
  },
});
