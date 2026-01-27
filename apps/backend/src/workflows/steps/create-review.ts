import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../../modules/review"
import ReviewModuleService from "../../modules/review/service"

export type CreateReviewStepInput = {
  product_id: string
  customer_id: string
  customer_name: string
  customer_email: string
  order_id?: string
  rating: number
  title: string
  content: string
  verified_purchase: boolean
  status: "pending" | "approved" | "rejected"
}

export const createReviewStep = createStep(
  "create-review",
  async (input: CreateReviewStepInput, { container }) => {
    const reviewModuleService: ReviewModuleService = container.resolve(REVIEW_MODULE)

    const review = await reviewModuleService.createReviews(input)

    return new StepResponse(review, review.id)
  },
  async (reviewId, { container }) => {
    if (!reviewId) {
      return
    }

    const reviewModuleService: ReviewModuleService = container.resolve(REVIEW_MODULE)

    await reviewModuleService.deleteReviews(reviewId)
  }
)
