import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { modificationTokenService } from "../../src/services/modification-token";

jest.setTimeout(120 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("Unified Order Cancellation Integration Tests", () => {
      let region;

      beforeEach(async () => {
        const container = getContainer();
        const regionModule = container.resolve("region");
        region = await regionModule.createRegions({
          name: "Test Region",
          currency_code: "usd",
        });
      });

      it("6.2: should reject cancellation for shipped orders (AC3)", async () => {
        const container = getContainer();
        const orderModule = container.resolve("order");
        
        // 1. Create an order with fulfillment_status 'shipped'
        const order = await orderModule.createOrders({
          email: "test@example.com",
          currency_code: "usd",
          region_id: region.id,
          status: "pending",
          fulfillment_status: "shipped", 
          items: [],
          shipping_address: {
             first_name: "John",
             last_name: "Doe",
             address_1: "123 Main St",
             city: "New York",
             country_code: "us",
             postal_code: "10001"
          },
          metadata: {
             payment_intent_id: "pi_shipped_123"
          }
        });

        // 2. Generate a valid token
        const token = modificationTokenService.generateToken(order.id, "pi_shipped_123", new Date());

        // 3. Attempt cancellation
        try {
          await api.post(`/store/orders/${order.id}/cancel`, {}, {
            headers: { "x-modification-token": token }
          });
          throw new Error("Should have thrown 409");
        } catch (err) {
          if (!err.response) throw err;
          expect(err.response.status).toBe(409);
          expect(err.response.data.code).toBe("order_shipped");
          expect(err.response.data.message).toContain("already been processed for shipping");
        }
      });

      it("6.1: should allow cancellation after window (Refund path)", async () => {
        const container = getContainer();
        const orderModule = container.resolve("order");
        
        // 1. Create an order
        const order = await orderModule.createOrders({
          email: "test@example.com",
          currency_code: "usd",
          region_id: region.id,
          status: "pending",
          items: [],
          shipping_address: {
             first_name: "John",
             last_name: "Doe",
             address_1: "123 Main St",
             city: "New York",
             country_code: "us",
             postal_code: "10001"
          },
          metadata: {
             payment_intent_id: "pi_refund_123"
          }
        });

        // 2. Generate an EXPIRED token (simulates post-capture)
        const expiredToken = modificationTokenService.generateToken(order.id, "pi_refund_123", new Date(Date.now() - 3600 * 1000 * 24));

        // 3. Mock Stripe check - The workflow uses stripe.paymentIntents.retrieve
        // We can mock the provider or the stripe client if it's in the container.
        // Actually, we can mock the step if we use Medusa's Remote Query or similar, 
        // but for now let's see if we can just mock the stripe service.
        
        // In this environment, we might not have a real stripe client.
        // Let's mock the 'stripe' service if it exists.
        try {
            const stripeService = container.resolve("stripePaymentService");
            jest.spyOn(stripeService, "getPaymentIntent").mockResolvedValue({
                id: "pi_refund_123",
                status: "succeeded",
                amount: 1000
            });
        } catch (e) {
            // Service might not be registered if provider isn't loaded
        }

        const response = await api.post(`/store/orders/${order.id}/cancel`, {}, {
          headers: { "x-modification-token": expiredToken }
        });

        expect(response.status).toBe(200);
        expect(response.data.payment_action).toBe("refund");
      });
    });
  },
});
