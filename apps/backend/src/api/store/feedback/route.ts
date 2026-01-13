import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type FeedbackModuleService from "../../../modules/feedback/service"
import { FEEDBACK_MODULE } from "../../../modules/feedback"

const FeedbackRequestSchema = z.object({
  // Required fields
  feedback_type: z.enum(["csat", "nps", "ces", "general"]).default("csat"),
  score: z.number().min(0).max(10),
  session_id: z.string().min(1, "session_id is required"),
  page_url: z.string().min(1, "page_url is required"),
  page_route: z.string().min(1, "page_route is required"),
  trigger: z
    .enum([
      "floating_button",
      "exit_intent",
      "post_purchase",
      "time_based",
      "scroll_depth",
      "manual",
    ])
    .default("floating_button"),

  // Optional fields
  comment: z.string().max(500).optional().nullable(),
  page_title: z.string().optional().nullable(),
  referrer: z.string().optional().nullable(),

  // Product context (optional)
  product_id: z.string().optional().nullable(),
  product_handle: z.string().optional().nullable(),
  product_title: z.string().optional().nullable(),
  selected_variant_id: z.string().optional().nullable(),
  selected_options: z.record(z.string(), z.string()).optional().nullable(),

  // Cart context
  cart_item_count: z.number().default(0),
  cart_total: z.number().default(0),
  cart_items: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        quantity: z.number(),
        price: z.number().optional(),
      })
    )
    .optional()
    .nullable(),

  // User context
  customer_id: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  region: z.string().optional().nullable(),

  // Session/device context
  context: z
    .object({
      time_on_page: z.number().optional(),
      scroll_depth: z.number().min(0).max(100).optional(),
      viewport_width: z.number().optional(),
      viewport_height: z.number().optional(),
      device_type: z.enum(["mobile", "tablet", "desktop"]).optional(),
      user_agent: z.string().optional(),
      touch_enabled: z.boolean().optional(),
      connection_type: z.string().optional(),
    })
    .optional()
    .nullable(),
})

type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")

  try {
    // Validate request body
    const parseResult = FeedbackRequestSchema.safeParse(req.body)

    if (!parseResult.success) {
      res.status(400).json({
        type: "invalid_data",
        message: "Validation failed",
        errors: parseResult.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      })
      return
    }

    const data: FeedbackRequest = parseResult.data
    const feedbackService = req.scope.resolve<FeedbackModuleService>(FEEDBACK_MODULE)

    // Check rate limit
    const { allowed, remaining } = await feedbackService.checkRateLimit(data.session_id)

    if (!allowed) {
      res.setHeader("Retry-After", "3600")
      res.status(429).json({
        type: "rate_limit_exceeded",
        message: "Too many feedback submissions. Please try again later.",
        retry_after: 3600,
      })
      return
    }

    // Create feedback entry
    const feedback = await feedbackService.createFeedbacks({
      feedback_type: data.feedback_type,
      score: data.score,
      comment: data.comment,
      trigger: data.trigger,
      page_url: data.page_url,
      page_route: data.page_route,
      page_title: data.page_title,
      referrer: data.referrer,
      product_id: data.product_id,
      product_handle: data.product_handle,
      product_title: data.product_title,
      selected_variant_id: data.selected_variant_id,
      selected_options: data.selected_options as Record<string, unknown> | null | undefined,
      cart_item_count: data.cart_item_count,
      cart_total: data.cart_total,
      cart_items: data.cart_items as unknown as Record<string, unknown> | null | undefined,
      customer_id: data.customer_id,
      session_id: data.session_id,
      locale: data.locale,
      region: data.region,
      context: data.context as Record<string, unknown> | null | undefined,
      submitted_at: new Date(),
    })

    // Log feedback submission (mask any potential PII)
    logger.info(
      `[Feedback] Submitted: type=${data.feedback_type}, score=${data.score}, ` +
        `route=${data.page_route}, trigger=${data.trigger}, session=${data.session_id.substring(0, 8)}...`
    )

    res.setHeader("X-RateLimit-Remaining", String(remaining - 1))
    res.status(201).json({
      feedback: {
        id: feedback.id,
        submitted_at: feedback.submitted_at,
      },
    })
  } catch (error: any) {
    logger.error(`[Feedback] Error submitting feedback: ${error.message}`)
    res.status(500).json({
      type: "server_error",
      message: "Failed to submit feedback. Please try again.",
    })
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Stats endpoint - requires admin authentication
  // For now, return 403 until admin routes are implemented
  res.status(403).json({
    type: "forbidden",
    message: "Admin authentication required. Use /admin/feedback/stats instead.",
  })
}
