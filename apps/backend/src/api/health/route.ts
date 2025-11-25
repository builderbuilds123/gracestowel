import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Health check endpoint for Railway deployment monitoring.
 * Returns 200 OK when the service is healthy.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "medusa-backend"
  })
}

