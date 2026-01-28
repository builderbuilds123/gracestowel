import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

/**
 * Schema for GET /admin/reviews list query params.
 * Compatible with validateAndTransformQuery + req.queryConfig (createFindParams pattern).
 */
export const GetAdminReviewsSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  order: z.string().optional(),
  fields: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  product_id: z.string().optional(),
})

/**
 * GET /admin/reviews
 * List all reviews with optional filters. Uses req.queryConfig when validateAndTransformQuery middleware runs.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  const pagination = req.queryConfig?.pagination as
    | { take?: number; skip?: number; order?: Record<string, "ASC" | "DESC"> }
    | undefined
  const take = pagination?.take ?? 20
  const skip = pagination?.skip ?? 0
  const order = pagination?.order ?? { created_at: "DESC" }

  const filters: Record<string, unknown> = { ...(req.filterableFields ?? {}) }

  const [reviews, count] = await reviewService.listAndCountReviews(filters, {
    take,
    skip,
    order,
  })

  res.json({
    reviews,
    count,
    limit: take,
    offset: skip,
  })
}

