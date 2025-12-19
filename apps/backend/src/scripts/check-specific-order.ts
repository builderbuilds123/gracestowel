
import { ExecArgs } from "@medusajs/framework/types";

export default async function checkSpecificOrder({ container }: ExecArgs) {
  const query = container.resolve("query");
  const orderId = "order_01KCT6N50F62A9QECVS1Y28J9D";
  
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "total", "created_at", "metadata", "currency_code", "region_id"],
    filters: { id: orderId }
  });

  if (orders.length === 0) {
    console.log(`Order ${orderId} NOT FOUND.`);
    return;
  }

  const latest = orders[0] as any;
  console.log("ORDER FOUND:");
  console.log("ID:", latest.id);
  console.log("CREATED_AT:", latest.created_at);
  console.log("STATUS:", latest.status);
  console.log("CURRENCY:", latest.currency_code);
  console.log("REGION_ID:", latest.region_id);
  console.log("TOTAL:", latest.total);

  // Payment status is stored in metadata for this project
  console.log("PAYMENT_STATUS:", latest.metadata?.payment_status || "N/A");

  console.log("METADATA:", JSON.stringify(latest.metadata, null, 2));
}
