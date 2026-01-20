import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendWelcomeEmailWorkflow } from "../workflows/send-welcome-email"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"

export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log("Customer created event received:", data.id)
  
  try {
    await sendWelcomeEmailWorkflow(container).run({
      input: {
        id: data.id,
      },
    })
    console.log("Welcome email workflow completed for customer:", data.id)
  } catch (error) {
    console.error("Failed to send welcome email:", error)
  }

  // Send admin notification for new customer signup
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.CUSTOMER_CREATED,
      title: "New Customer Signup",
      description: `Customer ${data.id} has signed up`,
      metadata: { customer_id: data.id },
    })
  } catch (error) {
    console.error("Failed to send admin notification for new customer:", error)
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
}

