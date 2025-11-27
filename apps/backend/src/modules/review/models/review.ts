import { model } from "@medusajs/framework/utils"

const Review = model.define("review", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  customer_id: model.text().nullable(),
  customer_name: model.text(),
  customer_email: model.text().nullable(),
  rating: model.number(),
  title: model.text(),
  content: model.text(),
  verified_purchase: model.boolean().default(false),
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
])

export default Review

