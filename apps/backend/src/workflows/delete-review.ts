import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deleteReviewStep } from "./steps/delete-review"

export type DeleteReviewInput = {
  ids: string[]
}

export const deleteReviewWorkflow = createWorkflow(
  "delete-review",
  function (input: DeleteReviewInput) {
    const deletedIds = deleteReviewStep(input)
    return new WorkflowResponse({ deletedIds })
  }
)
