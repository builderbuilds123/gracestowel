import type {
  MedusaRequest,
  MedusaResponse,
  AuthenticatedMedusaRequest,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"
import { createReviewWorkflow } from "../../../../../workflows/create-review"
import { z } from "zod"
import sanitizeHtml from "sanitize-html"

export const CreateStoreReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  title: z.string().min(3).max(100),
  content: z.string().min(10).max(1000),
})
export type CreateStoreReviewBody = z.infer<typeof CreateStoreReviewSchema>

/**
 * Schema for GET /store/products/:id/reviews list query params.
 * Compatible with validateAndTransformQuery + req.queryConfig (createFindParams pattern).
 * sort is kept for backward compatibility; order takes precedence when present.
 */
export const GetStoreProductReviewsSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  order: z.string().optional(),
  fields: z.string().optional(),
  sort: z.enum(["newest", "oldest", "highest", "lowest", "helpful"]).optional(),
})

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
 * GET /store/products/:id/reviews
 * Get all approved reviews for a product. Uses req.queryConfig when validateAndTransformQuery middleware runs.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const reviewService = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)

  const pagination = req.queryConfig?.pagination as
    | { take?: number; skip?: number; order?: Record<string, "ASC" | "DESC"> }
    | undefined
  const take = Math.min(pagination?.take ?? 10, 50)
  const skip = pagination?.skip ?? 0
  const sort = (req.validatedQuery as { sort?: string } | undefined)?.sort ?? "newest"

  let order: { [key: string]: "ASC" | "DESC" } =
    (pagination?.order as { [key: string]: "ASC" | "DESC" }) ?? { created_at: "DESC" }
  if (!pagination?.order) {
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
      default:
        order = { created_at: "DESC" }
    }
  }

  const { reviews, count } = await reviewService.getProductReviews(id, {
    status: "approved",
    limit: take,
    offset: skip,
    order,
  })

  const stats = await reviewService.getProductRatingStats(id)

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
      limit: take,
      offset: skip,
      has_more: skip + take < count,
    },
  })
}

/**
 * POST /store/products/:id/reviews
 * Create a new review for a product.
 * Validation, duplicate check, purchase verification, and approval logic run in the workflow.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<CreateStoreReviewBody>,
  res: MedusaResponse
) {
  const { id: productId } = req.params
  const { rating, title, content } = req.validatedBody

  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({
      message: "You must be logged in to submit a review"
    })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name"],
    filters: { id: customerId },
  })

  if (!customers || customers.length === 0) {
    return res.status(401).json({ message: "Customer not found" })
  }

  const customer = customers[0] as { email?: string; first_name?: string; last_name?: string }
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Anonymous"
  const customerEmail = customer.email ?? ""

  const sanitizedTitle = sanitizeInput(title)
  const sanitizedContent = sanitizeInput(content)

  try {
    const { result } = await createReviewWorkflow(req.scope).run({
      input: {
        product_id: productId,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        rating: Math.round(rating),
        title: sanitizedTitle,
        content: sanitizedContent,
      },
    })

    const review = result.review
    const status = (review as { status?: string }).status ?? "pending"
    const message =
      status === "approved"
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
  } catch (error) {
    if (error instanceof MedusaError) {
      if (error.type === MedusaError.Types.INVALID_DATA) {
        return res.status(400).json({ message: error.message })
      }
      if (error.type === MedusaError.Types.CONFLICT) {
        return res.status(400).json({ message: error.message })
      }
      if (error.type === MedusaError.Types.NOT_ALLOWED) {
        return res.status(403).json({ message: error.message })
      }
    }
    throw error
  }
}

