import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { sendWelcomeEmailWorkflow } from "../workflows/send-welcome-email"

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
}

export const config: SubscriberConfig = {
  event: "customer.created",
}

