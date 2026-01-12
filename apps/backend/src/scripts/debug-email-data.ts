
import { ExecArgs } from "@medusajs/framework/types"

export default async function({ container }: ExecArgs) {
  const query = container.resolve("query")
  
  // Use a recent order ID
  console.log("SCRIPT STARTING...");
  const orderId = "order_01KER66YGP5MZFPQ8X91TAPFWS"; 

  console.log("Querying order:", orderId);

  const { data: orders } = await query.graph({
      entity: "order",
      fields: [
          "id", 
          "total", 
          "subtotal", 
          "currency_code",
          "items.quantity",
          "items.unit_price",
          "items.title",
          "items.product_title",
          "items.variant_title",
          "items.metadata"
      ],
      pagination: {
          take: 1,
          order: { created_at: "DESC" }
      }
  });

  const order = orders[0];
  console.log("Order ID:", order.id);
  console.log("Order Total:", order.total);
  console.log("Order Subtotal:", order.subtotal);
  console.log("Currency:", order.currency_code);
  console.log("Items:", JSON.stringify(order.items, null, 2));

  const mappedItems = (order.items || []).map((orderItem: any) => {
      // Direct access assumption
      return {
        title: orderItem.product_title || orderItem.title || 'Unknown Product',
        variant_title: orderItem.variant_title,
        quantity: Number(orderItem.quantity) || 1,
        unit_price: Number(orderItem.unit_price) || 0,
        calculated_total: (Number(orderItem.quantity) || 1) * (Number(orderItem.unit_price) || 0), 
        raw: orderItem
      };
  });
  
  console.log("Mapped Items for Email (Direct Access):");
  console.log(JSON.stringify(mappedItems, null, 2));
}

