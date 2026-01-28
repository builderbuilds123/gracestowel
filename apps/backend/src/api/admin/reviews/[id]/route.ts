import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"
import { updateReviewWorkflow } from "../../../../workflows/update-review"
import { deleteReviewWorkflow } from "../../../../workflows/delete-review"

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

  const updates: {
    id: string
    status?: "pending" | "approved" | "rejected"
    [key: string]: unknown
  } = { id, ...updateData }
  if (status !== undefined) {
    updates.status = status
  }

  try {
    const { result } = await updateReviewWorkflow(req.scope).run({
      input: [updates],
    })
    const review = result.reviews?.[0]
    if (!review) {
      return res.status(404).json({ message: "Review not found" })
    }
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

  try {
    await deleteReviewWorkflow(req.scope).run({
      input: { ids: [id] },
    })
    res.json({ message: "Review deleted successfully" })
  } catch (error) {
    res.status(404).json({ message: "Review not found" })
  }
}

