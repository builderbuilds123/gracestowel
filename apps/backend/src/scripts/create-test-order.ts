
import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import Stripe from "stripe";

async function createStripePI() {
  const apiKey = process.env.STRIPE_SECRET_KEY || "sk_test_mock";
  const stripe = new Stripe(apiKey, { apiVersion: "2024-12-18.acacia" } as any);

  try {
     const pi = await stripe.paymentIntents.create({
        amount: 4000,
        currency: "usd",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: "Test Order PI",
        payment_method: "pm_card_visa",
        confirm: true,
        capture_method: "manual"
     });


     return pi.id;
  } catch (e) {
     console.warn("Stripe PI creation failed (mocking):", e);
     return "pi_mock_generated";
  }
}

import { IOrderModuleService, IProductModuleService, IPricingModuleService, IFulfillmentModuleService } from "@medusajs/framework/types";

export default async function createTestOrder({ container }: ExecArgs) {
  const orderService: IOrderModuleService = container.resolve(Modules.ORDER);
  const productService: IProductModuleService = container.resolve(Modules.PRODUCT);
  
  console.log("Starting order creation...");
  
  // 1. Get a variant
  const [product] = await productService.listProducts({}, { relations: ["variants"] });
  if (!product || !product.variants?.length) {
    throw new Error("No products found");
  }
  const variant = product.variants[0];
  console.log("Found variant:", variant.id);

  // 2. Create Order
  const order = await orderService.createOrders({
    region_id: "reg_01J2...", // Dummy or fetch actual? We'll let Medusa handle or use a known one if seeded.
    // Actually, createOrders doesn't strictly validate region_id existence in module-only mode unless linked?
    // But for full context, we might need a channel.
    // Let's keep it simple.
    currency_code: "usd",
    email: "test-mod@example.com",
    items: [
      {
        title: product.title,
        variant_id: variant.id,
        quantity: 2,

        unit_price: 20, 
      }
    ],
    sales_channel_id: "sc_01...", // Optional
    shipping_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "123 Test St",
        city: "Test City",
        country_code: "us",
    },
    metadata: {
        stripe_payment_intent_id: await createStripePI()
    }
  });

  console.log("CREATED_ORDER_ID:", order.id);
  // Need to fetch full order to get Item IDs? createOrders returns the order.
  // Check if items are populated.
  
  const fullOrder = await orderService.retrieveOrder(order.id, { relations: ["items"] });
  console.log("CREATED_ITEM_ID:", fullOrder.items?.[0]?.id);

  console.log("CREATED_VARIANT_ID:", variant.id);
}
