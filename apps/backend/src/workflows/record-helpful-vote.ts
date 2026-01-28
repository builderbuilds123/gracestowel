import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { recordHelpfulVoteStep } from "./steps/record-helpful-vote"

export type RecordHelpfulVoteInput = {
  reviewId: string
  voterIdentifier: string
  voterType: "customer" | "anonymous"
}

export const recordHelpfulVoteWorkflow = createWorkflow(
  "record-helpful-vote",
  function (input: RecordHelpfulVoteInput) {
    const result = recordHelpfulVoteStep(input)
    return new WorkflowResponse(result)
  }
)
