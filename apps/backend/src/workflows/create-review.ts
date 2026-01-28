import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createReviewStep } from "./steps/create-review"
import { validateAndPrepareCreateReviewStep } from "./steps/validate-and-prepare-create-review"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

export type CreateReviewInput = {
  product_id: string
  customer_id: string
  customer_name: string
  customer_email: string
  rating: number
  title: string
  content: string
}

export const createReviewWorkflow = createWorkflow(
  "create-review",
  function (input: CreateReviewInput) {
    useQueryGraphStep({
      entity: "product",
      fields: ["id"],
      filters: { id: input.product_id },
      options: { throwIfKeyNotFound: true },
    })

    const prepared = validateAndPrepareCreateReviewStep(input)
    const review = createReviewStep(prepared)
    return new WorkflowResponse({ review })
  }
)
