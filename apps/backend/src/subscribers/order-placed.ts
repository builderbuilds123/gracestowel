import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation"

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log("Order placed event received:", data.id)
  
  try {
    await sendOrderConfirmationWorkflow(container).run({
      input: {
        id: data.id,
      },
    })
    console.log("Order confirmation email workflow completed for order:", data.id)
  } catch (error) {
    console.error("Failed to send order confirmation email:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

