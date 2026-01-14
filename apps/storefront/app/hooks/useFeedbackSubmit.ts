import { useState, useCallback } from "react"
import type { FeedbackContextData } from "./useFeedbackContext"
import type { TriggerType } from "./useFeedbackTrigger"

interface SubmitFeedbackParams {
  feedbackType: "csat" | "nps" | "ces" | "general"
  score: number
  comment?: string
  trigger: TriggerType
  context: FeedbackContextData
}

interface UseFeedbackSubmitResult {
  submit: (params: SubmitFeedbackParams) => Promise<{ success: boolean; error?: string }>
  isSubmitting: boolean
  error: string | null
}

export function useFeedbackSubmit(): UseFeedbackSubmitResult {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (params: SubmitFeedbackParams): Promise<{ success: boolean; error?: string }> => {
      setIsSubmitting(true)
      setError(null)

      try {
        const backendUrl =
          typeof window !== "undefined"
            ? (window as any).ENV?.MEDUSA_BACKEND_URL || "http://localhost:9000"
            : "http://localhost:9000"

        const payload = {
          feedback_type: params.feedbackType,
          score: params.score,
          comment: params.comment || null,
          trigger: params.trigger,

          // Page context
          page_url: params.context.pageUrl,
          page_route: params.context.pageRoute,
          page_title: params.context.pageTitle,
          referrer: params.context.referrer,

          // Product context
          product_id: params.context.product?.id || null,
          product_handle: params.context.product?.handle || null,
          product_title: params.context.product?.title || null,
          selected_variant_id: params.context.product?.selectedVariantId || null,
          selected_options: params.context.product?.selectedOptions || null,

          // Cart context
          cart_item_count: params.context.cart.itemCount,
          cart_total: params.context.cart.total,
          cart_items: params.context.cart.items,

          // User context
          customer_id: params.context.user.customerId,
          session_id: params.context.user.sessionId,
          locale: params.context.user.locale,
          region: params.context.user.region,

          // Session context
          context: {
            time_on_page: params.context.session.timeOnPage,
            scroll_depth: params.context.session.scrollDepth,
            viewport_width: params.context.session.viewportWidth,
            viewport_height: params.context.session.viewportHeight,
            device_type: params.context.session.deviceType,
            user_agent: params.context.session.userAgent,
            touch_enabled: params.context.session.touchEnabled,
            connection_type: params.context.session.connectionType,
          },
        }

        const publishableKey =
          typeof window !== "undefined"
            ? (window as any).ENV?.MEDUSA_PUBLISHABLE_KEY || ""
            : ""

        const response = await fetch(`${backendUrl}/store/feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(publishableKey && { "x-publishable-api-key": publishableKey }),
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          let data: { message?: string } = {}
          try {
            data = await response.json()
          } catch {
            // JSON parse failed, use empty object
          }

          if (response.status === 429) {
            setError("You've submitted too much feedback recently. Please try again later.")
            return { success: false, error: "Rate limit exceeded" }
          }

          const errorMessage = data.message || "Failed to submit feedback"
          setError(errorMessage)
          return { success: false, error: errorMessage }
        }

        // Track in PostHog if available
        if (typeof window !== "undefined" && (window as any).posthog) {
          ;(window as any).posthog.capture("feedback_submitted", {
            feedback_type: params.feedbackType,
            score: params.score,
            trigger: params.trigger,
            page_route: params.context.pageRoute,
            has_comment: !!params.comment,
            product_id: params.context.product?.id || null,
          })
        }

        return { success: true }
      } catch (err: any) {
        const errorMessage = err.message || "Network error. Please try again."
        setError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        setIsSubmitting(false)
      }
    },
    []
  )

  return {
    submit,
    isSubmitting,
    error,
  }
}

export default useFeedbackSubmit
