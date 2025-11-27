import { model } from "@medusajs/framework/utils"

const Review = model.define("review", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  customer_id: model.text(), // Required - only verified buyers can review
  customer_name: model.text(),
  customer_email: model.text(), // Required for double verification
  order_id: model.text().nullable(), // For audit trail - references the order that verified purchase
  rating: model.number(),
  title: model.text(),
  content: model.text(),
  verified_purchase: model.boolean().default(true), // Always true for verified-only system
  status: model.enum(["pending", "approved", "rejected"]).default("pending"),
  helpful_count: model.number().default(0),
})
.indexes([
  {
    on: ["product_id"],
  },
  {
    on: ["customer_id"],
  },
  {
    on: ["status"],
  },
  {
    // Unique constraint: one review per customer per product
    on: ["customer_id", "product_id"],
    unique: true,
  },
])

export default Review

