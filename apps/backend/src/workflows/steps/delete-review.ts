import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../../modules/review"
import type ReviewModuleService from "../../modules/review/service"

export type DeleteReviewStepInput = {
  ids: string[]
}

export const deleteReviewStep = createStep(
  "delete-review",
  async (input: DeleteReviewStepInput, { container }) => {
    const reviewModuleService: ReviewModuleService = container.resolve(REVIEW_MODULE)
    await reviewModuleService.deleteReviews(input.ids)
    return new StepResponse(input.ids, input.ids)
  },
  async () => {
    // Delete is not restorable without snapshots; compensation is no-op
  }
)
