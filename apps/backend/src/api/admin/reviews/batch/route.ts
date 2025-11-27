import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"

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
      await reviewService.deleteReviews(ids)
      res.json({
        message: `${ids.length} review(s) deleted successfully`,
        count: ids.length,
      })
    } else {
      const status: "approved" | "rejected" = action === "approve" ? "approved" : "rejected"

      // Update each review with proper typing
      const updates: Array<{ id: string; status: "approved" | "rejected" }> = ids.map((id) => ({
        id,
        status,
      }))

      await reviewService.updateReviews(updates)

      res.json({
        message: `${ids.length} review(s) ${action}d successfully`,
        count: ids.length,
      })
    }
  } catch (error) {
    console.error("Batch operation error:", error)
    res.status(500).json({ message: "Failed to process batch operation" })
  }
}

