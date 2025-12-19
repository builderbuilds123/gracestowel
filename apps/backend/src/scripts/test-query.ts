import { ExecArgs } from "@medusajs/framework/types";

export default async function({ container }: ExecArgs) {
  const orderId = "order_01KCT8TAZD9TNC6BD53ZFQQSK3";
  const query = container.resolve("query");
  
  console.log(`Querying order ${orderId} with filters...`);
  try {
      const { data: orders } = await query.graph({
          entity: "order",
          fields: ["id", "total", "summary", "currency_code", "status", "metadata"],
          filters: { id: orderId }, // Exact match
      });

      console.log(`Found ${orders.length} orders.`);
      if(orders.length > 0) {
          const o = orders[0] as any;
          console.log("Total:", o.total);
          console.log("String(Total):", String(o.total));
          console.log("Summary exists:", !!o.summary);
          console.log("Summary:", JSON.stringify(o.summary, null, 2));
          console.log("Type of Total:", typeof o.total);
          if (typeof o.total === 'object' && o.total !== null) {
              console.log("Is Object. Constructor:", (o.total as object).constructor.name);
              console.log("Stringified:", JSON.stringify(o.total));
          }
      } else {
          console.log("Order NOT found with ID filter.");
          
          // Try fetching ALL and checking ID manually to see if ID mismatches somehow (trimming?)
          const { data: allOrders } = await query.graph({ entity: "order", fields: ["id"], pagination: { take: 5 }});
          console.log("Recent orders:", allOrders.map((o: any) => o.id));
      }
  } catch (e) {
      console.error("Query failed:", e);
  }
}
