import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendShippingConfirmationWorkflow } from "../workflows/send-shipping-confirmation"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"

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

  // Send admin notification for order shipped
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.FULFILLMENT_CREATED,
      title: "Order Shipped",
      description: `Fulfillment ${data.id} has been created`,
      metadata: { fulfillment_id: data.id },
    })
  } catch (error) {
    console.error("Failed to send admin notification for fulfillment:", error)
  }
}

export const config: SubscriberConfig = {
  event: "fulfillment.created",
}

