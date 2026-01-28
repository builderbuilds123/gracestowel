import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../modules/review"
import type ReviewModuleService from "../../modules/review/service"
import type { CreateReviewStepInput } from "./create-review"

export type ValidateAndPrepareCreateReviewInput = {
  product_id: string
  customer_id: string
  customer_name: string
  customer_email: string
  rating: number
  title: string
  content: string
}

export const validateAndPrepareCreateReviewStep = createStep(
  "validate-and-prepare-create-review",
  async (input: ValidateAndPrepareCreateReviewInput, { container }) => {
    const reviewModule: ReviewModuleService = container.resolve(REVIEW_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (config: {
        entity: string
        fields: string[]
        filters: Record<string, unknown>
      }) => Promise<{ data: unknown[] }>
    }

    const rating = Math.round(input.rating)
    if (rating < 1 || rating > 5) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Rating must be between 1 and 5"
      )
    }
    if (!input.title || input.title.length < 3) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Title must be at least 3 characters"
      )
    }
    if (input.title.length > 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Title must be at most 100 characters"
      )
    }
    if (!input.content || input.content.length < 10) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Review content must be at least 10 characters"
      )
    }
    if (input.content.length > 1000) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Review content must be at most 1000 characters"
      )
    }

    const hasReviewed = await reviewModule.hasCustomerReviewed(
      input.product_id,
      input.customer_id
    )
    if (hasReviewed) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "You have already reviewed this product"
      )
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "status",
        "fulfillment_status",
        "items.variant.product_id",
        "items.variant.product.id",
      ],
      filters: { customer_id: input.customer_id },
    }) as {
      data: Array<{
        id: string
        status?: string
        fulfillment_status?: string
        items?: Array<{
          variant?: { product_id?: string; product?: { id?: string } }
          product_id?: string
        }>
      }>
    }

    const isCompleted = (o: (typeof orders)[0]) =>
      o.status === "completed" ||
      o.fulfillment_status === "fulfilled" ||
      o.fulfillment_status === "shipped"
    const hasProduct = (o: (typeof orders)[0], productId: string) =>
      o.items?.some((item) => {
        const pid =
          item.variant?.product_id ?? item.variant?.product?.id ?? item.product_id
        return pid === productId
      })

    const matchingOrder = orders.find(
      (o) => isCompleted(o) && hasProduct(o, input.product_id)
    )
    if (!matchingOrder) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You must purchase this product before reviewing"
      )
    }

    const status: "pending" | "approved" =
      rating >= 4 ? "approved" : "pending"
    const prepared: CreateReviewStepInput = {
      product_id: input.product_id,
      customer_id: input.customer_id,
      customer_name: input.customer_name,
      customer_email: input.customer_email,
      order_id: matchingOrder.id,
      rating,
      title: input.title,
      content: input.content,
      verified_purchase: true,
      status,
    }
    return new StepResponse(prepared, prepared)
  },
  async () => {
    // No mutable state to roll back
  }
)
