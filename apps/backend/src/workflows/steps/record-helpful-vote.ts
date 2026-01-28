import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../modules/review"
import type ReviewModuleService from "../../modules/review/service"

export type RecordHelpfulVoteStepInput = {
  reviewId: string
  voterIdentifier: string
  voterType: "customer" | "anonymous"
}

export type RecordHelpfulVoteStepOutput = {
  helpful_count: number
  user_voted: true
}

export const recordHelpfulVoteStep = createStep(
  "record-helpful-vote",
  async (input: RecordHelpfulVoteStepInput, { container }) => {
    const reviewModule: ReviewModuleService = container.resolve(REVIEW_MODULE)

    const review = await reviewModule.retrieveReview(input.reviewId).catch(() => null)
    if (!review) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    if (review.status !== "approved") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Review not found")
    }

    const hasVoted = await reviewModule.hasVoted(input.reviewId, input.voterIdentifier)
    if (hasVoted) {
      throw new MedusaError(MedusaError.Types.CONFLICT, "You have already marked this review as helpful")
    }

    const previousCount = review.helpful_count ?? 0
    await reviewModule.recordHelpfulVote(
      input.reviewId,
      input.voterIdentifier,
      input.voterType
    )
    const newCount = await reviewModule.incrementHelpfulCount(input.reviewId)

    const compensationData = {
      reviewId: input.reviewId,
      voterIdentifier: input.voterIdentifier,
      previousCount,
    }
    return new StepResponse(
      { helpful_count: newCount, user_voted: true as const },
      compensationData
    )
  },
  async (compensationData, { container }) => {
    if (!compensationData) return
    const reviewModule: ReviewModuleService = container.resolve(REVIEW_MODULE)
    await reviewModule.updateReviews({
      id: compensationData.reviewId,
      helpful_count: compensationData.previousCount,
    })
    const votes = await reviewModule.listReviewHelpfulVotes({
      review_id: compensationData.reviewId,
      voter_identifier: compensationData.voterIdentifier,
    })
    if (votes.length > 0) {
      await reviewModule.deleteReviewHelpfulVotes(votes.map((v) => v.id))
    }
  }
)
