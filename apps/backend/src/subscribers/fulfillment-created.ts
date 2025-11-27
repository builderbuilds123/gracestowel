import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendShippingConfirmationWorkflow } from "../workflows/send-shipping-confirmation"

export default async function fulfillmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log("Fulfillment created event received:", data.id)
  
  try {
    await sendShippingConfirmationWorkflow(container).run({
      input: {
        fulfillment_id: data.id,
      },
    })
    console.log("Shipping confirmation email workflow completed for fulfillment:", data.id)
  } catch (error) {
    console.error("Failed to send shipping confirmation email:", error)
  }
}

export const config: SubscriberConfig = {
  event: "fulfillment.created",
}

