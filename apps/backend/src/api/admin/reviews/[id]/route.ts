import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"

/**
 * GET /admin/reviews/:id
 * Get a single review by ID
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    const review = await reviewService.retrieveReview(id)
    res.json({ review })
  } catch (error) {
    res.status(404).json({ message: "Review not found" })
  }
}

/**
 * POST /admin/reviews/:id
 * Update a review (approve, reject, or update fields)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { status, ...updateData } = req.body as {
    status?: "pending" | "approved" | "rejected"
    [key: string]: unknown
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    // Verify review exists
    await reviewService.retrieveReview(id)

    // Build update object with proper typing
    const updates: {
      status?: "pending" | "approved" | "rejected"
      [key: string]: unknown
    } = { ...updateData }
    if (status) {
      updates.status = status
    }

    const review = await reviewService.updateReviews({ id, ...updates })

    res.json({
      review,
      message: status
        ? `Review ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "updated"}`
        : "Review updated",
    })
  } catch (error) {
    res.status(404).json({ message: "Review not found" })
  }
}

/**
 * DELETE /admin/reviews/:id
 * Delete a review
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    await reviewService.deleteReviews(id)
    res.json({ message: "Review deleted successfully" })
  } catch (error) {
    res.status(404).json({ message: "Review not found" })
  }
}

