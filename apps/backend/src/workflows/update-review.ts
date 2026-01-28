import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateReviewStep } from "./steps/update-review"

export type UpdateReviewInput = {
  id: string
  status?: "pending" | "approved" | "rejected"
  admin_response?: string | null
  [key: string]: unknown
}[]

export const updateReviewWorkflow = createWorkflow(
  "update-review",
  function (input: UpdateReviewInput) {
    const reviews = updateReviewStep(input)

    return new WorkflowResponse({
      reviews,
    })
  }
)
