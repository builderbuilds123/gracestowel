import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPostHog } from "../../utils/posthog"

/**
 * Health check endpoint for Railway deployment monitoring.
 * Returns 200 OK when the service is healthy.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Track health check in PostHog (optional: sample this if high volume)
  try {
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: 'system_health_check',
        event: 'health_check',
        properties: {
          status: 'ok',
          service: 'medusa-backend',
          timestamp: new Date().toISOString()
        }
      })
    }
  } catch (error) {
    console.error('[PostHog] Failed to track health check:', error)
  }

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "medusa-backend"
  })
}

