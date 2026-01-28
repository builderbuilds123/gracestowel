import type {
  MedusaRequest,
  MedusaResponse,
  AuthenticatedMedusaRequest,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"
import { recordHelpfulVoteWorkflow } from "../../../../../workflows/record-helpful-vote"

/**
 * Get client IP address from request
 */
function getClientIp(req: MedusaRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"]
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim()
  }
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0]
  }
  return req.ip || "unknown"
}

/**
 * POST /store/reviews/:reviewId/helpful
 * Mark a review as helpful (increment counter)
 *
 * Prevents duplicate votes:
 * - Authenticated users: tracked by customer_id
 * - Anonymous users: tracked by IP address
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { reviewId } = req.params

  if (!reviewId) {
    return res.status(400).json({ message: "Review ID is required" })
  }

  const customerId = req.auth_context?.actor_id
  const voterIdentifier = customerId || getClientIp(req)
  const voterType: "customer" | "anonymous" = customerId ? "customer" : "anonymous"

  try {
    const { result } = await recordHelpfulVoteWorkflow(req.scope).run({
      input: { reviewId, voterIdentifier, voterType },
    })
    res.json(result)
  } catch (error) {
    if (error instanceof MedusaError) {
      if (
        error.type === MedusaError.Types.NOT_FOUND ||
        error.type === MedusaError.Types.NOT_ALLOWED
      ) {
        return res.status(404).json({ message: "Review not found" })
      }
      if (error.type === MedusaError.Types.CONFLICT) {
        return res.status(400).json({
          message: "You have already marked this review as helpful",
          user_voted: true,
        })
      }
    }
    throw error
  }
}

/**
 * GET /store/reviews/:reviewId/helpful
 * Check if current user has voted on this review
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { reviewId } = req.params

  if (!reviewId) {
    return res.status(400).json({ message: "Review ID is required" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  let review
  try {
    review = await reviewService.retrieveReview(reviewId)
  } catch {
    return res.status(404).json({ message: "Review not found" })
  }

  if (review.status !== "approved") {
    return res.status(404).json({ message: "Review not found" })
  }

  const customerId = req.auth_context?.actor_id
  const voterIdentifier = customerId || getClientIp(req)
  const hasVoted = await reviewService.hasVoted(reviewId, voterIdentifier)

  res.json({
    helpful_count: review.helpful_count,
    user_voted: hasVoted,
  })
}

