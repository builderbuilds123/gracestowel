import { useLocation } from "react-router"
import { FeedbackPopup } from "./FeedbackPopup"
import { FeedbackButton } from "./FeedbackButton"
import { useFeedbackContext } from "../../hooks/useFeedbackContext"
import { useFeedbackTrigger } from "../../hooks/useFeedbackTrigger"
import { useFeedbackSubmit } from "../../hooks/useFeedbackSubmit"

interface FeedbackWidgetProps {
  productData?: {
    id?: string
    handle?: string
    title?: string
    selectedVariantId?: string
    selectedOptions?: Record<string, string>
  }
  disabled?: boolean
}

/**
 * FeedbackWidget - Main component for the feedback collection system
 *
 * Renders:
 * - Floating feedback button (bottom-right)
 * - Feedback popup modal (triggered by button, exit intent, post-purchase, etc.)
 *
 * Usage:
 * - Add to root layout for site-wide feedback
 * - Pass productData when on product pages for richer context
 */
export function FeedbackWidget({ productData, disabled = false }: FeedbackWidgetProps) {
  const location = useLocation()
  const context = useFeedbackContext(productData)
  const {
    shouldShowButton,
    shouldShowPopup,
    triggerType,
    surveyType,
    openPopup,
    closePopup,
    dismissButton,
    recordSubmission,
  } = useFeedbackTrigger(location.pathname)
  const { submit, isSubmitting } = useFeedbackSubmit()

  if (disabled) return null

  const handleSubmit = async (data: { score: number; comment: string }) => {
    if (!triggerType) return { success: false }

    const result = await submit({
      feedbackType: surveyType,
      score: data.score,
      comment: data.comment,
      trigger: triggerType,
      context,
    })

    if (result.success) {
      recordSubmission()
    }

    return result
  }

  return (
    <>
      <FeedbackButton
        visible={shouldShowButton}
        onClick={() => openPopup("floating_button")}
        onDismiss={dismissButton}
      />

      <FeedbackPopup
        isOpen={shouldShowPopup}
        onClose={closePopup}
        onSubmit={handleSubmit}
        surveyType={surveyType}
        triggerType={triggerType || "floating_button"}
        isSubmitting={isSubmitting}
      />
    </>
  )
}

export default FeedbackWidget
