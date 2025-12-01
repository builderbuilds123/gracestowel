import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Resend } from "resend"

interface SyncToResendAudienceInput {
  email: string
  first_name?: string
  last_name?: string
  unsubscribed?: boolean
}

interface SyncToResendAudienceOutput {
  synced: boolean
  contactId?: string
  reason?: string
}

/**
 * Workflow step to sync a contact to Resend for marketing purposes.
 * This adds the customer to Resend's contact list for broadcasts and marketing emails.
 *
 * Requires RESEND_AUDIENCE_ID environment variable to be set.
 */
export const syncToResendAudienceStep = createStep(
  "sync-to-resend-audience",
  async (data: SyncToResendAudienceInput): Promise<StepResponse<SyncToResendAudienceOutput>> => {
    const apiKey = process.env.RESEND_API_KEY
    const audienceId = process.env.RESEND_AUDIENCE_ID

    if (!apiKey) {
      console.warn("RESEND_API_KEY not configured, skipping audience sync")
      return new StepResponse({ synced: false, reason: "API key not configured" })
    }

    if (!audienceId) {
      console.warn("RESEND_AUDIENCE_ID not configured, skipping audience sync")
      return new StepResponse({ synced: false, reason: "Audience ID not configured" })
    }

    const resend = new Resend(apiKey)

    try {
      const { data: contact, error } = await resend.contacts.create({
        audienceId,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        unsubscribed: data.unsubscribed ?? false,
      })

      if (error) {
        console.error("Failed to sync contact to Resend:", error)
        return new StepResponse({ synced: false, reason: error.message })
      }

      console.log(`Contact synced to Resend audience: ${contact?.id}`)
      return new StepResponse({ synced: true, contactId: contact?.id })
    } catch (error) {
      console.error("Error syncing to Resend audience:", error)
      return new StepResponse({ synced: false, reason: String(error) })
    }
  }
)

