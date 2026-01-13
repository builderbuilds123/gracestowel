import { useState, useEffect, useRef } from "react"
import { X, Loader2, CheckCircle } from "lucide-react"
import { RatingScale } from "./RatingScale"

interface FeedbackPopupProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { score: number; comment: string }) => Promise<{ success: boolean }>
  surveyType: "csat" | "nps"
  triggerType: string
  isSubmitting?: boolean
}

const SURVEY_CONFIG = {
  csat: {
    title: "How satisfied are you with this page?",
    placeholder: "What could we improve? (optional)",
    maxScore: 5,
  },
  nps: {
    title: "How likely are you to recommend Grace's Towel to a friend?",
    placeholder: "What's the main reason for your score? (optional)",
    maxScore: 10,
  },
}

export function FeedbackPopup({
  isOpen,
  onClose,
  onSubmit,
  surveyType,
  triggerType,
  isSubmitting = false,
}: FeedbackPopupProps) {
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const config = SURVEY_CONFIG[surveyType]

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen) {
      setScore(null)
      setComment("")
      setSubmitted(false)
      setError(null)
    }
  }, [isOpen])

  // Focus modal when opened
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (score === null) {
      setError("Please select a rating")
      return
    }

    setError(null)
    const result = await onSubmit({ score, comment })

    if (result.success) {
      setSubmitted(true)
      // Auto-close after showing thank you
      setTimeout(() => {
        onClose()
      }, 2000)
    } else {
      setError("Failed to submit feedback. Please try again.")
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        tabIndex={-1}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50 z-10"
          aria-label="Close feedback form"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          // Thank you state
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-serif text-text-earthy mb-2">Thank You!</h2>
            <p className="text-text-earthy/70">
              Your feedback helps us improve Grace's Towel.
            </p>
          </div>
        ) : (
          // Survey form
          <div className="p-6">
            <h2
              id="feedback-title"
              className="text-lg font-serif text-text-earthy text-center mb-6 pr-8"
            >
              {config.title}
            </h2>

            {/* Rating Scale */}
            <div className="mb-6">
              <RatingScale
                type={surveyType}
                value={score}
                onChange={setScore}
                disabled={isSubmitting}
              />
            </div>

            {/* Comment Input */}
            <div className="mb-4">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={config.placeholder}
                disabled={isSubmitting}
                maxLength={500}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg resize-none 
                         focus:outline-none focus:ring-2 focus:ring-accent-earthy/20 focus:border-accent-earthy
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-text-earthy placeholder:text-text-earthy/40"
              />
              <div className="text-xs text-text-earthy/40 text-right mt-1">
                {comment.length}/500
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || score === null}
                className="w-full py-3 bg-accent-earthy text-white rounded-lg font-medium
                         hover:bg-accent-earthy/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </button>

              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full py-2 text-text-earthy/60 hover:text-text-earthy transition-colors text-sm"
              >
                Maybe Later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FeedbackPopup
