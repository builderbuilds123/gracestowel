
import { ExecArgs } from "@medusajs/framework/types"

export default async function({ container }: ExecArgs) {
  const orderId = "order_01KEQZWG0C4M5MJHMYW5BQJ1ZH";
  const query = container.resolve("query");

  console.log("Checking PaymentCollection for order:", orderId);

  try {
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "created_at",
            "payment_collections.id",
            "payment_collections.status"
        ],
        pagination: {
            take: 5,
            order: { created_at: "DESC" }
        }
    });

    console.log("Last 5 orders:", JSON.stringify(orders, null, 2));

  } catch (error) {
    console.error("Query failed:", error);
  }
}
