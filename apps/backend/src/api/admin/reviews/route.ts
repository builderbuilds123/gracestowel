import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

/**
 * GET /admin/reviews
 * List all reviews with optional filters
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const {
    limit = "20",
    offset = "0",
    status,
    product_id,
  } = req.query as {
    limit?: string
    offset?: string
    status?: "pending" | "approved" | "rejected"
    product_id?: string
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  // Build filters
  const filters: Record<string, unknown> = {}
  if (status) {
    filters.status = status
  }
  if (product_id) {
    filters.product_id = product_id
  }

  const [reviews, count] = await reviewService.listAndCountReviews(filters, {
    take: parseInt(limit),
    skip: parseInt(offset),
    order: { created_at: "DESC" },
  })

  res.json({
    reviews,
    count,
    limit: parseInt(limit),
    offset: parseInt(offset),
  })
}

