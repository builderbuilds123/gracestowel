import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"

import sanitizeHtml from "sanitize-html"

/**
 * Sanitize user input to prevent XSS attacks
 * Uses multiple layers of protection:
 * 1. Decode HTML entities to literal characters
 * 2. Explicitly block dangerous patterns (script, event handlers)
 * 3. Strip all HTML tags
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== "string") return ""

  // Use sanitize-html to strip all tags and unsafe attributes
  // We want to allow NO HTML tags in reviews, just plain text
  return sanitizeHtml(input, {
    allowedTags: [], // No tags allowed
    allowedAttributes: {}, // No attributes allowed
    disallowedTagsMode: 'recursiveEscape' // Escape disallowed tags recursively to prevent bypasses
  }).trim()
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

interface OrderItem {
  variant?: {
    product_id?: string
    product?: {
      id?: string
    }
  }
  product_id?: string
}

interface Order {
  id: string
  email?: string
  customer_id?: string
  status?: string
  fulfillment_status?: string
  items?: OrderItem[]
}

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

  const parsedLimit = Math.min(parseInt(limit) || 10, 50) // Max 50 per page
  const parsedOffset = parseInt(offset) || 0

  const { reviews, count } = await reviewService.getProductReviews(id, {
    status: "approved",
    limit: parsedLimit,
    offset: parsedOffset,
    order,
  })

  const stats = await reviewService.getProductRatingStats(id)

  // Response format matching API contract
  res.json({
    reviews: reviews.map((r) => ({
      id: r.id,
      customer_name: r.customer_name,
      rating: r.rating,
      title: r.title,
      content: r.content,
      verified_purchase: r.verified_purchase,
      helpful_count: r.helpful_count,
      created_at: r.created_at,
    })),
    stats,
    pagination: {
      total: count,
      limit: parsedLimit,
      offset: parsedOffset,
      has_more: parsedOffset + parsedLimit < count,
    },
  })
}

/**
 * POST /store/products/:id/reviews
 * Create a new review for a product
 *
 * Requirements:
 * - Customer must be authenticated
 * - Customer must have purchased the product (verified buyer)
 * - Customer cannot have already reviewed this product
 * - 4-5 star reviews auto-approve, 1-3 star require moderation
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: productId } = req.params
  const { rating, title, content } = req.body as {
    rating: number
    title: string
    content: string
  }

  // 1. Check authentication - customer must be logged in
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({
      message: "You must be logged in to submit a review"
    })
  }

  // 2. Validate input
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" })
  }

  if (!title || title.length < 3) {
    return res.status(400).json({ message: "Title must be at least 3 characters" })
  }

  if (title.length > 100) {
    return res.status(400).json({ message: "Title must be at most 100 characters" })
  }

  if (!content || content.length < 10) {
    return res.status(400).json({ message: "Review content must be at least 10 characters" })
  }

  if (content.length > 1000) {
    return res.status(400).json({ message: "Review content must be at most 1000 characters" })
  }

  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 3. Check for duplicate review
  const hasReviewed = await reviewService.hasCustomerReviewed(productId, customerId)
  if (hasReviewed) {
    return res.status(400).json({
      message: "You have already reviewed this product"
    })
  }

  // 4. Get customer details
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name"],
    filters: { id: customerId },
  })

  if (!customers || customers.length === 0) {
    return res.status(401).json({
      message: "Customer not found"
    })
  }

  const customer = customers[0]
  const customerEmail = customer.email || ""
  const customerName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ") || "Anonymous"

  // 5. Verify purchase - check if customer has a completed/fulfilled order with this product
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "customer_id",
      "status",
      "fulfillment_status",
      "items.variant.product_id",
      "items.variant.product.id",
    ],
    filters: {
      customer_id: customerId,
    },
  }) as { data: Order[] }

  // Find an order that:
  // 1. Has matching customer_id (already filtered)
  // 2. Has status completed OR fulfillment_status fulfilled/shipped
  // 3. Contains an item with the product being reviewed
  const matchingOrder = orders.find((order) => {
    // Check if order is completed/fulfilled
    const isCompleted =
      order.status === "completed" ||
      order.fulfillment_status === "fulfilled" ||
      order.fulfillment_status === "shipped"

    if (!isCompleted) return false

    // Check if order contains the product
    return order.items?.some((item) => {
      const itemProductId =
        item.variant?.product_id ||
        item.variant?.product?.id ||
        item.product_id
      return itemProductId === productId
    })
  })

  if (!matchingOrder) {
    return res.status(403).json({
      message: "You must purchase this product before reviewing"
    })
  }

  // 6. Sanitize input (XSS prevention)
  const sanitizedTitle = sanitizeInput(title)
  const sanitizedContent = sanitizeInput(content)

  // 7. Determine approval status (smart approval)
  // 4-5 star reviews from verified buyers auto-approve
  const status = reviewService.getAutoApprovalStatus(Math.round(rating), true)

  // 8. Create the review
  const review = await reviewService.createReviews({
    product_id: productId,
    customer_id: customerId,
    customer_name: customerName,
    customer_email: customerEmail,
    order_id: matchingOrder.id ? String(matchingOrder.id) : undefined, // Audit trail
    rating: Math.round(rating),
    title: sanitizedTitle,
    content: sanitizedContent,
    verified_purchase: true, // Always true for verified-only system
    status,
  })

  const message = status === "approved"
    ? "Thank you for your verified review!"
    : "Thank you for your review! It will be visible after approval."

  res.status(201).json({
    review: {
      id: review.id,
      rating: review.rating,
      title: review.title,
      verified_purchase: review.verified_purchase,
      created_at: review.created_at,
    },
    message,
  })
}

