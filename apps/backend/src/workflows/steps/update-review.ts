import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../../modules/review"
import ReviewModuleService from "../../modules/review/service"

export type UpdateReviewStepInput = {
  id: string
  status?: "pending" | "approved" | "rejected"
  admin_response?: string | null
  [key: string]: unknown
}[]

export const updateReviewStep = createStep(
  "update-review-step",
  async (input: UpdateReviewStepInput, { container }) => {
    const reviewModuleService: ReviewModuleService = container.resolve(REVIEW_MODULE)

    // Get original reviews before update
    const originalReviews = await reviewModuleService.listReviews({
      id: input.map((review) => review.id),
    })

    const reviews = await reviewModuleService.updateReviews(input)

    return new StepResponse(reviews, originalReviews)
  },
  async (originalData, { container }) => {
    if (!originalData || originalData.length === 0) {
      return
    }

    const reviewModuleService: ReviewModuleService = container.resolve(REVIEW_MODULE)

    // Restore original review data
    await reviewModuleService.updateReviews(
      originalData.map((review) => ({
        id: review.id,
        status: review.status,
        admin_response: review.admin_response,
      }))
    )
  }
)
