
import { ExecArgs } from "@medusajs/framework/types"

export default async function({ container }: ExecArgs) {
  const query = container.resolve("query")
  const orderId = "order_01KER66YGP5MZFPQ8X91TAPFWS"; // Valid ID
  
  console.log("!!! DEBUG START !!!");
  try {
      const { data: orders } = await query.graph({
          entity: "order",
          fields: [
              "id",
              "total",
              "subtotal",
              "items.id",
              "items.quantity",
              "items.unit_price",
              "items.title",
          ],
          filters: { id: orderId }
      })

      const order = orders[0];
      console.log("ORDER KEYS:", Object.keys(order));
      console.log("ORDER TOTAL:", order.total);
      console.log("ORDER SUBTOTAL:", order.subtotal);
      if (order.items && order.items.length && order.items[0]) {
          console.log("ITEM 0 KEYS:", Object.keys(order.items[0]));
          console.log("ITEM 0:", JSON.stringify(order.items[0], null, 2));
      }
  } catch (e) {
      console.error("DEBUG QUERY FAILED", e);
  }
  console.log("!!! DEBUG END !!!");
}
