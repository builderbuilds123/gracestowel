import { ExecArgs } from "@medusajs/framework/types"
import { cancelOrderWithRefundWorkflow } from "../workflows/cancel-order-with-refund"
import * as fs from 'fs';
import * as path from 'path';

export default async function({ container }: ExecArgs) {
  const orderId = "order_01KER66YGP5MZFPQ8X91TAPFWS";
  // Fetch PI from order
  const query = container.resolve("query");
  const { data: orders } = await query.graph({
      entity: "order",
      fields: [
          "*",
          "summary.*",
          "items.*",
          "total", 
          "subtotal"
      ],
      filters: { id: orderId }
  });
  
  const order = orders[0];
  console.log("Full Order Keys:", Object.keys(order).join(", "));
  console.log("Order Total:", order.total);
  console.log("Order Subtotal:", order.subtotal);
  console.log("Order Summary:", JSON.stringify((order as any).summary, null, 2));
  console.log("Order Items Sample:", JSON.stringify(order.items?.[0], null, 2));
  let paymentIntentId = order.metadata?.stripe_payment_intent_id;
  if (!paymentIntentId && order.payment_collections?.length) {
      const payment = order.payment_collections?.[0]?.payments?.[0];
      if (payment?.data?.id) {
          paymentIntentId = payment.data.id;
      }
  }

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      console.error("Could not find PaymentIntent ID for order", orderId);
      return;
  }

  console.log("Found PaymentIntent:", paymentIntentId);

  const reason = "Direct workflow debug";
  const isWithinGracePeriod = false; // Post-grace period to trigger refund

  console.log("Starting cancellation workflow debug for order:", orderId);

  try {
    const { result } = await cancelOrderWithRefundWorkflow(container).run({
        input: {
            orderId,
            paymentIntentId: paymentIntentId as string,
            reason,
            isWithinGracePeriod,
        },
    });
    console.log("Workflow Success:", result);
  } catch (error: any) {
    const errorLogPath = path.join(__dirname, 'error.log');
    const errorDetails = {
        name: (error as Error).name || "UnknownError",
        message: error.message,
        code: error.code,
        stack: error.stack,
        errors: error.errors
    };
    fs.writeFileSync(errorLogPath, JSON.stringify(errorDetails, null, 2));
    console.log("Error written to", errorLogPath);
  }
}
