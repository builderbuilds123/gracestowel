import { model } from "@medusajs/framework/utils"

/**
 * Tracks helpful votes on reviews to prevent duplicate voting.
 * Each voter (identified by customer_id or IP) can only vote once per review.
 */
const ReviewHelpfulVote = model.define("review_helpful_vote", {
  id: model.id().primaryKey(),
  review_id: model.text(), // FK to review
  voter_identifier: model.text(), // customer_id for authenticated users, IP for anonymous
  voter_type: model.enum(["customer", "anonymous"]).default("anonymous"),
})
.indexes([
  {
    on: ["review_id"],
  },
  {
    on: ["voter_identifier"],
  },
  {
    // Unique constraint: one vote per voter per review
    on: ["review_id", "voter_identifier"],
    unique: true,
  },
])

export default ReviewHelpfulVote

