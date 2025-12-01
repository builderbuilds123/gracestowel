import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"

/**
 * GET /store/products/:id/reviews
 * Get all approved reviews for a product
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { limit = "10", offset = "0", sort = "newest" } = req.query as {
    limit?: string
    offset?: string
    sort?: "newest" | "oldest" | "highest" | "lowest" | "helpful"
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  // Determine sort order
  let order: { [key: string]: "ASC" | "DESC" } = { created_at: "DESC" }
  switch (sort) {
    case "oldest":
      order = { created_at: "ASC" }
      break
    case "highest":
      order = { rating: "DESC" }
      break
    case "lowest":
      order = { rating: "ASC" }
      break
    case "helpful":
      order = { helpful_count: "DESC" }
      break
  }

  const { reviews, count } = await reviewService.getProductReviews(id, {
    status: "approved",
    limit: parseInt(limit),
    offset: parseInt(offset),
    order,
  })

  const stats = await reviewService.getProductRatingStats(id)

  res.json({
    reviews,
    count,
    limit: parseInt(limit),
    offset: parseInt(offset),
    stats,
  })
}

/**
 * POST /store/products/:id/reviews
 * Create a new review for a product
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: productId } = req.params
  const { rating, title, content, customer_name, customer_email } = req.body as {
    rating: number
    title: string
    content: string
    customer_name: string
    customer_email?: string
  }

  // Validate input
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" })
  }

  if (!title || title.length < 3) {
    return res.status(400).json({ message: "Title must be at least 3 characters" })
  }

  if (!content || content.length < 10) {
    return res.status(400).json({ message: "Review content must be at least 10 characters" })
  }

  if (!customer_name || customer_name.length < 2) {
    return res.status(400).json({ message: "Name is required" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  // Check if authenticated customer already reviewed this product
  const customerId = (req as any).auth_context?.actor_id
  if (customerId) {
    const hasReviewed = await reviewService.hasCustomerReviewed(productId, customerId)
    if (hasReviewed) {
      return res.status(400).json({ message: "You have already reviewed this product" })
    }
  }

  // Check for verified purchase
  const verifiedPurchase = customerId
    ? await reviewService.isVerifiedPurchase(productId, customerId)
    : false

  // Create the review (pending approval by default)
  const review = await reviewService.createReviews({
    product_id: productId,
    customer_id: customerId || null,
    customer_name,
    customer_email: customer_email || null,
    rating: Math.round(rating),
    title: title.trim(),
    content: content.trim(),
    verified_purchase: verifiedPurchase,
    status: "pending", // Reviews need approval
  })

  res.status(201).json({
    review,
    message: "Thank you for your review! It will be visible after approval.",
  })
}

