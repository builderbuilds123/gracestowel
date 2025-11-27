import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderCanceledWorkflow } from "../workflows/send-order-canceled"

export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log("Order canceled event received:", data.id)
  
  try {
    await sendOrderCanceledWorkflow(container).run({
      input: {
        id: data.id,
      },
    })
    console.log("Order canceled email workflow completed for order:", data.id)
  } catch (error) {
    console.error("Failed to send order canceled email:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}

