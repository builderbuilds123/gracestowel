import { MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"

class ReviewModuleService extends MedusaService({
  Review,
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
  async hasCustomerReviewed(productId: string, customerId: string) {
    const reviews = await this.listReviews({
      product_id: productId,
      customer_id: customerId,
    })
    return reviews.length > 0
  }

  /**
   * Check if customer has purchased the product (for verified purchase badge)
   */
  async isVerifiedPurchase(productId: string, customerId: string): Promise<boolean> {
    // TODO: Check order history to verify purchase
    // For now, return false - this would query the order module
    return false
  }
}

export default ReviewModuleService

