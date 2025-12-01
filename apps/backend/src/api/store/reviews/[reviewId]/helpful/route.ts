import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"

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
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { reviewId } = req.params

  if (!reviewId) {
    return res.status(400).json({ message: "Review ID is required" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  // Check if review exists
  let review
  try {
    review = await reviewService.retrieveReview(reviewId)
  } catch {
    return res.status(404).json({ message: "Review not found" })
  }

  // Only approved reviews can receive helpful votes
  if (review.status !== "approved") {
    return res.status(404).json({ message: "Review not found" })
  }

  // Determine voter identifier
  const customerId = (req as any).auth_context?.actor_id
  const voterIdentifier = customerId || getClientIp(req)
  const voterType: "customer" | "anonymous" = customerId ? "customer" : "anonymous"

  // Check if already voted
  const hasVoted = await reviewService.hasVoted(reviewId, voterIdentifier)
  if (hasVoted) {
    return res.status(400).json({ 
      message: "You have already marked this review as helpful",
      helpful_count: review.helpful_count,
      user_voted: true,
    })
  }

  // Record the vote
  try {
    await reviewService.recordHelpfulVote(reviewId, voterIdentifier, voterType)
    const newCount = await reviewService.incrementHelpfulCount(reviewId)

    res.json({
      helpful_count: newCount,
      user_voted: true,
    })
  } catch (error: unknown) {
    // Handle unique constraint violation (race condition)
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return res.status(400).json({ 
        message: "You have already marked this review as helpful",
        helpful_count: review.helpful_count,
        user_voted: true,
      })
    }
    throw error
  }
}

/**
 * GET /store/reviews/:reviewId/helpful
 * Check if current user has voted on this review
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { reviewId } = req.params

  if (!reviewId) {
    return res.status(400).json({ message: "Review ID is required" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  // Check if review exists
  let review
  try {
    review = await reviewService.retrieveReview(reviewId)
  } catch {
    return res.status(404).json({ message: "Review not found" })
  }

  // Only approved reviews are accessible
  if (review.status !== "approved") {
    return res.status(404).json({ message: "Review not found" })
  }

  // Determine voter identifier
  const customerId = (req as any).auth_context?.actor_id
  const voterIdentifier = customerId || getClientIp(req)

  // Check if already voted
  const hasVoted = await reviewService.hasVoted(reviewId, voterIdentifier)

  res.json({
    helpful_count: review.helpful_count,
    user_voted: hasVoted,
  })
}

