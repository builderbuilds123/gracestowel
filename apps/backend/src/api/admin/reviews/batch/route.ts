import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"
import { updateReviewWorkflow } from "../../../../workflows/update-review"
import { deleteReviewWorkflow } from "../../../../workflows/delete-review"
import { logger } from "../../../../utils/logger"

/**
 * POST /admin/reviews/batch
 * Batch update reviews (approve or reject multiple at once)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { ids, action } = req.body as {
    ids: string[]
    action: "approve" | "reject" | "delete"
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids array is required" })
  }

  if (!action || !["approve", "reject", "delete"].includes(action)) {
    return res.status(400).json({ message: "action must be 'approve', 'reject', or 'delete'" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  try {
    if (action === "delete") {
      await deleteReviewWorkflow(req.scope).run({
        input: { ids },
      })
      res.json({
        message: `${ids.length} review(s) deleted successfully`,
        count: ids.length,
      })
    } else {
      const status: "approved" | "rejected" = action === "approve" ? "approved" : "rejected"

      // Update each review with proper typing using workflow
      const updates: Array<{ id: string; status: "approved" | "rejected" }> = ids.map((id) => ({
        id,
        status,
      }))

      const { result } = await updateReviewWorkflow(req.scope).run({
        input: updates,
      })

      res.json({
        message: `${ids.length} review(s) ${action}d successfully`,
        count: ids.length,
        reviews: result.reviews,
      })
    }
  } catch (error) {
    logger.error(
      "admin.reviews.batch",
      "Batch operation error",
      { err: error },
      error instanceof Error ? error : undefined
    )
    res.status(500).json({ message: "Failed to process batch operation" })
  }
}

