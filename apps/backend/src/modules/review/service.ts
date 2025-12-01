import { MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"
import ReviewHelpfulVote from "./models/review-helpful-vote"

export interface VerifiedPurchaseResult {
  canReview: boolean
  orderId?: string
  reason?: string
}

class ReviewModuleService extends MedusaService({
  Review,
  ReviewHelpfulVote,
}) {
  /**
   * Get reviews for a product with optional filters
   */
  async getProductReviews(
    productId: string,
    options: {
      status?: string
      limit?: number
      offset?: number
      order?: { [key: string]: "ASC" | "DESC" }
    } = {}
  ) {
    const { status = "approved", limit = 10, offset = 0, order = { created_at: "DESC" } } = options

    const [reviews, count] = await this.listAndCountReviews(
      { product_id: productId, status },
      { take: limit, skip: offset, order }
    )

    return { reviews, count, limit, offset }
  }

  /**
   * Get average rating for a product
   */
  async getProductRatingStats(productId: string) {
    const reviews = await this.listReviews({
      product_id: productId,
      status: "approved",
    })

    if (reviews.length === 0) {
      return {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
    const average = sum / reviews.length

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating as 1 | 2 | 3 | 4 | 5]++
      }
    })

    return {
      average: Math.round(average * 10) / 10,
      count: reviews.length,
      distribution,
    }
  }

  /**
   * Check if a customer has already reviewed a product
   */
  async hasCustomerReviewed(productId: string, customerId: string): Promise<boolean> {
    const reviews = await this.listReviews({
      product_id: productId,
      customer_id: customerId,
    })
    return reviews.length > 0
  }

  /**
   * Determine the review status based on rating (smart approval)
   * 4-5 star reviews from verified buyers auto-approve
   * 1-3 star reviews require moderation
   */
  getAutoApprovalStatus(rating: number, isVerifiedPurchase: boolean): "pending" | "approved" {
    if (isVerifiedPurchase && rating >= 4) {
      return "approved"
    }
    return "pending"
  }

  /**
   * Check if a voter has already voted on a review
   */
  async hasVoted(reviewId: string, voterIdentifier: string): Promise<boolean> {
    const votes = await this.listReviewHelpfulVotes({
      review_id: reviewId,
      voter_identifier: voterIdentifier,
    })
    return votes.length > 0
  }

  /**
   * Record a helpful vote for a review
   */
  async recordHelpfulVote(
    reviewId: string,
    voterIdentifier: string,
    voterType: "customer" | "anonymous"
  ): Promise<void> {
    await this.createReviewHelpfulVotes({
      review_id: reviewId,
      voter_identifier: voterIdentifier,
      voter_type: voterType,
    })
  }

  /**
   * Increment the helpful count for a review
   */
  async incrementHelpfulCount(reviewId: string): Promise<number> {
    const review = await this.retrieveReview(reviewId)
    const newCount = (review.helpful_count || 0) + 1
    await this.updateReviews({ id: reviewId, helpful_count: newCount })
    return newCount
  }
}

export default ReviewModuleService

