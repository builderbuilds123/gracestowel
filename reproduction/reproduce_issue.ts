import { action } from "../apps/storefront/app/routes/api.payment-intent";

// Mock Cloudflare Context
const context = {
  cloudflare: {
    env: {
      STRIPE_SECRET_KEY: "sk_test_12345", // Mock or Real one if available, but for now let's see what happens with a mock
      MEDUSA_BACKEND_URL: "http://localhost:9000",
      MEDUSA_PUBLISHABLE_KEY: "pk_12345",
    },
  },
};

// Mock Request
const body = {
  amount: 1000,
  currency: "usd",
  cartItems: [
    {
      title: "Test Item",
      price: "1000",
      quantity: 1,
      variantId: "variant_123"
    }
  ]
};

const request = new Request("http://localhost:8788/api/payment-intent", {
  method: "POST",
  body: JSON.stringify(body),
});

async function run() {
  try {
    const response = await action({ request, context, params: {} } as any);
    if (response instanceof Response) {
        console.log("Response Status:", response.status);
        const data = await response.json();
        console.log("Response Data:", data);
    } else {
        console.log("Response Object:", response);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
