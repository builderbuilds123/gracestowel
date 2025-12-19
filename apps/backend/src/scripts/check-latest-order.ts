
import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function checkLatestOrder({ container }: ExecArgs) {
  const query = container.resolve("query");

  
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "payment_status", "total", "created_at", "metadata", "currency_code", "region_id"],
    pagination: {
        order: {
            created_at: "DESC"
        },
        take: 5
    }
  });

  if (orders.length === 0) {
    console.log("No orders found.");
    return;
  }

  console.log(`Found ${orders.length} recent orders:`);
  orders.forEach((o) => {
      const order = o as any;
      console.log(`--------------------------------`);
      console.log("ORDER_ID:", order.id);
      console.log("CREATED_AT:", order.created_at);
      console.log("STATUS:", order.status);
      console.log("CURRENCY_CODE:", order.currency_code);
      console.log("REGION_ID:", order.region_id);
      console.log("METADATA:", JSON.stringify(order.metadata, null, 2));
      console.log("MOD_TOKEN:", order.modification_token || "N/A"); // Check for token
  });
}
