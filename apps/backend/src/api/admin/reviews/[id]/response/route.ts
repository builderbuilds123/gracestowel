import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"
import { updateReviewWorkflow } from "../../../../../workflows/update-review"
import { z } from "zod"
import sanitizeHtml from "sanitize-html"

/**
 * Sanitize admin response input to prevent XSS attacks
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== "string") return ""

  return sanitizeHtml(input, {
    allowedTags: [], // No tags allowed
    allowedAttributes: {}, // No attributes allowed
    disallowedTagsMode: "recursiveEscape",
  }).trim()
}

export const PostAdminReviewResponseSchema = z.object({
  content: z.string().min(1).max(2000),
})

export type PostAdminReviewResponseBody = z.infer<typeof PostAdminReviewResponseSchema>

/**
 * POST /admin/reviews/:id/response
 * Create or update an admin response to a review (upsert: use POST for both create and update).
 */
export async function POST(
  req: MedusaRequest<PostAdminReviewResponseBody>,
  res: MedusaResponse
) {
  const { id } = req.params

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    await reviewService.retrieveReview(id)
  } catch {
    return res.status(404).json({ message: "Review not found" })
  }

  const body = req.validatedBody
  const sanitizedContent = sanitizeInput(body.content)
  if (!sanitizedContent) {
    return res.status(400).json({ message: "Response content cannot be empty" })
  }

  try {
    const { result } = await updateReviewWorkflow(req.scope).run({
      input: [{ id, admin_response: sanitizedContent }],
    })
    const updatedReview = result.reviews?.[0]
    res.json({
      review: updatedReview,
      message: "Admin response added successfully",
    })
  } catch (error) {
    if (error && typeof error === "object" && "message" in error && error.message === "Review not found") {
      return res.status(404).json({ message: "Review not found" })
    }
    res.status(500).json({ message: "Failed to add admin response" })
  }
}

/**
 * DELETE /admin/reviews/:id/response
 * Delete an admin response from a review
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    // Verify review exists
    await reviewService.retrieveReview(id)

    // Remove admin response using workflow
    const { result } = await updateReviewWorkflow(req.scope).run({
      input: [
        {
          id,
          admin_response: null,
        },
      ],
    })

    const updatedReview = result.reviews[0]

    res.json({
      review: updatedReview,
      message: "Admin response deleted successfully",
    })
  } catch (error) {
    if (error && typeof error === "object" && "message" in error && error.message === "Review not found") {
      return res.status(404).json({ message: "Review not found" })
    }
    res.status(500).json({ message: "Failed to delete admin response" })
  }
}
