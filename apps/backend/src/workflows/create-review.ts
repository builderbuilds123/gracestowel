import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createReviewStep } from "./steps/create-review"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

type CreateReviewInput = {
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

export const createReviewWorkflow = createWorkflow(
  "create-review",
  (input: CreateReviewInput) => {
    // Check product exists
    useQueryGraphStep({
      entity: "product",
      fields: ["id"],
      filters: {
        id: input.product_id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    // Create the review
    const review = createReviewStep(input)

    return new WorkflowResponse({
      review,
    })
  }
)
