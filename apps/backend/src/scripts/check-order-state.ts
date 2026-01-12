import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function checkOrder({ container }) {
  const query = container.resolve("query")
  const orderId = "order_01KEQZ30QHB5W2ZAJ6DMD4SFJ4"
  
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id", 
      "status", 
      "payment_status",
      "fulfillment_status",
      "payment_collections.*",
      "payment_collections.payments.*",
      "payment_collections.payments.refunds.*",
      "summary"
    ],
    filters: { id: orderId }
  })

  if (orders.length > 0) {
    const order = orders[0];
    console.log("ORDER_DATA:" + JSON.stringify(order, null, 2))
  } else {
    console.log("ORDER_NOT_FOUND")
  }
}
