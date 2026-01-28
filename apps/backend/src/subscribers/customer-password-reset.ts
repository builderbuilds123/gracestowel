import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import { getEnv } from "../lib/env"
import { maskEmail } from "../utils/email-masking"

interface PasswordResetEventData {
  entity_id: string  // customer email for emailpass
  token: string
  actor_type: string
}

export default async function customerPasswordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEventData>) {
  const logger = container.resolve("logger")

  const isIntegrationTest = process.env.TEST_TYPE?.startsWith("integration")
  if (isIntegrationTest) {
    return
  }

  // Only handle customer password resets
  if (data.actor_type !== "customer") {
    return
  }

  // Get customer email
  const query = container.resolve("query")
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name"],
    filters: { email: data.entity_id },
  })

  if (!customers?.length) {
    logger.error(`[PASSWORD_RESET] Customer not found: ${data.entity_id}`)
    return
  }

  const customer = customers[0]
  if (!customer.email) {
    logger.error(`[PASSWORD_RESET] Customer email not found for ID: ${data.entity_id}`)
    return
  }

  const { STOREFRONT_URL } = getEnv()
  const resetUrl = `${STOREFRONT_URL}/account/reset-password?token=${encodeURIComponent(data.token)}`

  await enqueueEmail({
    entityId: customer.id,
    template: Templates.PASSWORD_RESET,
    recipient: customer.email,
    data: {
      first_name: customer.first_name || "Customer",
      reset_url: resetUrl,
      expires_in: "1 hour",
    },
  })

  logger.info(`[PASSWORD_RESET] Reset email queued for ${maskEmail(customer.email)}`)
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
