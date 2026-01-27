import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Auth Emailpass", () => {
      const password = "Password123!";
      let publishableKey: string;

      const ensurePublishableKey = async () => {
        const container = getContainer();
        const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
        let salesChannels = await salesChannelService.listSalesChannels({
          name: "Default Sales Channel",
        });

        if (!salesChannels.length) {
          const { result } = await createSalesChannelsWorkflow(container).run({
            input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
          });
          salesChannels = result;
        }

        const apiKeyService = container.resolve(Modules.API_KEY);
        const existingKeys = await apiKeyService.listApiKeys({
          title: "Auth Emailpass Test",
          type: "publishable",
        });

        if (existingKeys.length) {
          publishableKey = existingKeys[0].token;
          return;
        }

        const { result } = await createApiKeysWorkflow(container).run({
          input: {
            api_keys: [
              {
                title: "Auth Emailpass Test",
                type: "publishable",
                created_by: "auth-emailpass.spec.ts",
              },
            ],
          },
        });

        const createdKey = result[0];
        publishableKey = createdKey.token;

        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: {
            id: createdKey.id,
            add: [salesChannels[0].id],
          },
        });
      };

      const registerAndCreateCustomer = async (email: string) => {
        const registerRes = await api.post("/auth/customer/emailpass/register", {
          email,
          password,
        });
        expect(registerRes.status).toBe(200);
        expect(registerRes.data).toHaveProperty("token");

        const registerToken = registerRes.data.token;

        const customerRes = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "User" },
          {
            headers: {
              Authorization: `Bearer ${registerToken}`,
              "x-publishable-api-key": publishableKey,
            },
          }
        );
        expect(customerRes.status).toBe(200);
        expect(customerRes.data.customer.email).toBe(email);

        const loginRes = await api.post("/auth/customer/emailpass", {
          email,
          password,
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.data).toHaveProperty("token");

        return loginRes.data.token;
      };

      beforeEach(async () => {
        await ensurePublishableKey();
      });

      it("registers auth identity and creates customer", async () => {
        const email = "emailpass-test@example.com";
        await registerAndCreateCustomer(email);
      });

      it("logs in with email/password", async () => {
        const email = "emailpass-test-login@example.com";
        await registerAndCreateCustomer(email);

        const loginRes = await api.post("/auth/customer/emailpass", {
          email,
          password,
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.data).toHaveProperty("token");
      });

      it("returns customer profile for valid token", async () => {
        const email = "emailpass-test-me@example.com";
        const token = await registerAndCreateCustomer(email);

        const meRes = await api.get("/store/customers/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-publishable-api-key": publishableKey,
          },
        });
        expect(meRes.status).toBe(200);
        expect(meRes.data.customer.email).toBe(email);
      });

      it("accepts reset-password request", async () => {
        const email = "emailpass-test-reset@example.com";
        await registerAndCreateCustomer(email);

        const resetRes = await api.post("/auth/customer/emailpass/reset-password", {
          identifier: email,
        });
        expect([200, 201]).toContain(resetRes.status);
      });
    });
  },
});
