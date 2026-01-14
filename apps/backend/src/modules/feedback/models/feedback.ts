import { model } from "@medusajs/framework/utils"

const Feedback = model.define("feedback", {
  id: model.id().primaryKey(),

  // Feedback Type & Score
  feedback_type: model.enum(["csat", "nps", "ces", "general"]).default("csat"),
  score: model.number(),
  comment: model.text().nullable(),

  // Trigger Context
  trigger: model.enum([
    "floating_button",
    "exit_intent",
    "post_purchase",
    "time_based",
    "scroll_depth",
    "manual",
  ]).default("floating_button"),

  // Page Context
  page_url: model.text(),
  page_route: model.text(),
  page_title: model.text().nullable(),
  referrer: model.text().nullable(),

  // Product Context (nullable - not always on product page)
  product_id: model.text().nullable(),
  product_handle: model.text().nullable(),
  product_title: model.text().nullable(),
  selected_variant_id: model.text().nullable(),
  selected_options: model.json().nullable(),

  // Cart Context
  cart_item_count: model.number().default(0),
  cart_total: model.number().default(0),
  cart_items: model.json().nullable(),

  // User Context
  customer_id: model.text().nullable(),
  session_id: model.text(),
  locale: model.text().nullable(),
  region: model.text().nullable(),

  // Session/Device Context (JSON blob for flexibility)
  context: model.json().nullable(),

  // Metadata
  submitted_at: model.dateTime(),
  status: model.enum(["new", "reviewed", "actioned", "archived"]).default("new"),
  reviewed_by: model.text().nullable(),
  reviewed_at: model.dateTime().nullable(),
  internal_notes: model.text().nullable(),
})
.indexes([
  { on: ["feedback_type"] },
  { on: ["score"] },
  { on: ["trigger"] },
  { on: ["customer_id"] },
  { on: ["product_id"] },
  { on: ["page_route"] },
  { on: ["submitted_at"] },
  { on: ["status"] },
])

export default Feedback
