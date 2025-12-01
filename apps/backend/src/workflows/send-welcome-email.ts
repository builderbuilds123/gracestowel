import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "@medusajs/core-flows"
import { sendNotificationStep } from "./steps/send-notification"
import { syncToResendAudienceStep } from "./steps/sync-to-resend-audience"

type SendWelcomeEmailInput = {
  id: string
}

export const sendWelcomeEmailWorkflow = createWorkflow(
  "send-welcome-email",
  (input: SendWelcomeEmailInput) => {
    // Retrieve the customer details using Query
    const customers = useRemoteQueryStep({
      entry_point: "customer",
      fields: [
        "id",
        "email",
        "first_name",
        "last_name",
      ],
      variables: {
        filters: {
          id: input.id,
        },
      },
      list: true,
    })

    // Transform data for the notification
    const notificationData = transform({ customers }, (data) => {
      const customer = data.customers[0]

      if (!customer?.email) {
        return []
      }

      return [
        {
          to: customer.email,
          channel: "email",
          template: "welcome",
          data: {
            customer: {
              id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name,
            },
          },
        },
      ]
    })

    // Transform data for audience sync
    const audienceSyncData = transform({ customers }, (data) => {
      const customer = data.customers[0]
      return {
        email: customer?.email || "",
        first_name: customer?.first_name || undefined,
        last_name: customer?.last_name || undefined,
        unsubscribed: false,
      }
    })

    // Send the notification
    const notification = sendNotificationStep(notificationData)

    // Sync customer to Resend audience for marketing
    syncToResendAudienceStep(audienceSyncData)

    return new WorkflowResponse(notification)
  }
)

