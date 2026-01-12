
import { ExecArgs } from "@medusajs/framework/types"

export default async function({ container }: ExecArgs) {
  const query = container.resolve("query")
  
  // order_01KER66YGP5MZFPQ8X91TAPFWS is the valid one from before
  const orderId = "order_01KER66YGP5MZFPQ8X91TAPFWS"; 

  console.log("Querying order (Wildcard Fields):", orderId);

  try {
      const { data: orders } = await query.graph({
          entity: "order",
          fields: [
              "*",
              "items.*",
          ],
          filters: { id: orderId },
      })

      if (orders.length === 0) {
          console.log("Order not found");
          return;
      }

      const order = orders[0];
      console.log("Order Structure Keys:", Object.keys(order));
      if (order.items && order.items.length > 0) {
        console.log("First Item Full Structure:", JSON.stringify(order.items[0], null, 2));
      } else {
          console.log("No items found on order.");
      }

  } catch (err) {
      console.error("Query failed:", err);
  }
}
