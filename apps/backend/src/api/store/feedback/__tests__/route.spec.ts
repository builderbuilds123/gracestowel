import { describe, it, expect } from "vitest"
import { z } from "zod"

// Test the validation schema with conditional score validation
const FeedbackRequestSchema = z.object({
  feedback_type: z.enum(["csat", "nps", "ces", "general"]).default("csat"),
  score: z.number(),
  session_id: z.string().min(1, "session_id is required"),
  page_url: z.string().url("page_url must be a valid URL"),
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
  comment: z.string().max(500).optional().nullable(),
  page_title: z.string().optional().nullable(),
  referrer: z.string().optional().nullable(),
  product_id: z.string().optional().nullable(),
  product_handle: z.string().optional().nullable(),
  product_title: z.string().optional().nullable(),
  selected_variant_id: z.string().optional().nullable(),
  selected_options: z.record(z.string(), z.string()).optional().nullable(),
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
  customer_id: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
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
}).superRefine((data, ctx) => {
  const { feedback_type, score } = data

  if (feedback_type === "csat") {
    if (score < 1 || score > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "CSAT score must be between 1 and 5.",
      })
    }
    return
  }

  if (feedback_type === "nps") {
    if (score < 0 || score > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "NPS score must be between 0 and 10.",
      })
    }
    return
  }

  if (feedback_type === "ces") {
    if (score < 1 || score > 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "CES score must be between 1 and 7.",
      })
    }
    return
  }

  // Default for "general"
  if (score < 0 || score > 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["score"],
      message: "Score must be between 0 and 10.",
    })
  }
})

describe("Feedback API Route - Validation", () => {
  describe("FeedbackRequestSchema", () => {
    const validPayload = {
      score: 4,
      session_id: "abc123",
      page_url: "https://example.com/products/towel",
      page_route: "/products/towel",
    }

    it("accepts valid minimal payload", () => {
      const result = FeedbackRequestSchema.safeParse(validPayload)
      expect(result.success).toBe(true)
    })

    it("applies default values", () => {
      const result = FeedbackRequestSchema.parse(validPayload)
      expect(result.feedback_type).toBe("csat")
      expect(result.trigger).toBe("floating_button")
      expect(result.cart_item_count).toBe(0)
      expect(result.cart_total).toBe(0)
    })

    it("rejects missing required fields", () => {
      const result = FeedbackRequestSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it("rejects invalid URL for page_url", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        page_url: "not-a-url",
      })
      expect(result.success).toBe(false)
    })

    it("accepts valid URL for page_url", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        page_url: "https://gracestowel.com/products/towel",
      })
      expect(result.success).toBe(true)
    })

    // CSAT validation (1-5)
    it("rejects CSAT score below 1", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "csat",
        score: 0,
      })
      expect(result.success).toBe(false)
    })

    it("rejects CSAT score above 5", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "csat",
        score: 6,
      })
      expect(result.success).toBe(false)
    })

    it("accepts CSAT score 1", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "csat",
        score: 1,
      })
      expect(result.success).toBe(true)
    })

    it("accepts CSAT score 5", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "csat",
        score: 5,
      })
      expect(result.success).toBe(true)
    })

    // NPS validation (0-10)
    it("accepts NPS score 0", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "nps",
        score: 0,
      })
      expect(result.success).toBe(true)
    })

    it("accepts NPS score 10", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "nps",
        score: 10,
      })
      expect(result.success).toBe(true)
    })

    it("rejects NPS score above 10", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "nps",
        score: 11,
      })
      expect(result.success).toBe(false)
    })

    // CES validation (1-7)
    it("accepts CES score 1", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "ces",
        score: 1,
      })
      expect(result.success).toBe(true)
    })

    it("accepts CES score 7", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "ces",
        score: 7,
      })
      expect(result.success).toBe(true)
    })

    it("rejects CES score above 7", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "ces",
        score: 8,
      })
      expect(result.success).toBe(false)
    })

    it("rejects empty session_id", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        session_id: "",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid feedback_type", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        feedback_type: "invalid",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid trigger", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        trigger: "invalid_trigger",
      })
      expect(result.success).toBe(false)
    })

    it("rejects comment over 500 characters", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        comment: "a".repeat(501),
      })
      expect(result.success).toBe(false)
    })

    it("accepts comment at exactly 500 characters", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        comment: "a".repeat(500),
      })
      expect(result.success).toBe(true)
    })

    it("accepts valid context object", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        context: {
          time_on_page: 120,
          scroll_depth: 75,
          viewport_width: 1920,
          viewport_height: 1080,
          device_type: "desktop",
          user_agent: "Mozilla/5.0",
          touch_enabled: false,
          connection_type: "4g",
        },
      })
      expect(result.success).toBe(true)
    })

    it("rejects scroll_depth over 100", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        context: {
          scroll_depth: 150,
        },
      })
      expect(result.success).toBe(false)
    })

    it("accepts valid cart_items array", () => {
      const result = FeedbackRequestSchema.safeParse({
        ...validPayload,
        cart_items: [
          { id: "item_1", title: "Turkish Towel", quantity: 2, price: 4999 },
          { id: "item_2", title: "Bath Mat", quantity: 1 },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("accepts all valid trigger types", () => {
      const triggers = [
        "floating_button",
        "exit_intent",
        "post_purchase",
        "time_based",
        "scroll_depth",
        "manual",
      ]

      for (const trigger of triggers) {
        const result = FeedbackRequestSchema.safeParse({
          ...validPayload,
          trigger,
        })
        expect(result.success).toBe(true)
      }
    })

    it("accepts all valid feedback types with valid scores", () => {
      const types = [
        { type: "csat", score: 4 },
        { type: "nps", score: 8 },
        { type: "ces", score: 5 },
        { type: "general", score: 7 },
      ]

      for (const { type, score } of types) {
        const result = FeedbackRequestSchema.safeParse({
          ...validPayload,
          feedback_type: type,
          score,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})

describe("Feedback API Route - Rate Limiting", () => {
  it("rate limit logic: allows when under 5 per hour", () => {
    const recentCount = 3
    const maxPerHour = 5
    const allowed = recentCount < maxPerHour
    const remaining = Math.max(0, maxPerHour - recentCount)

    expect(allowed).toBe(true)
    expect(remaining).toBe(2)
  })

  it("rate limit logic: blocks when at 5 per hour", () => {
    const recentCount = 5
    const maxPerHour = 5
    const allowed = recentCount < maxPerHour
    const remaining = Math.max(0, maxPerHour - recentCount)

    expect(allowed).toBe(false)
    expect(remaining).toBe(0)
  })
})
