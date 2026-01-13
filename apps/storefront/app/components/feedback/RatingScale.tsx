import { useState } from "react"

interface RatingScaleProps {
  type: "csat" | "nps" | "ces"
  value: number | null
  onChange: (value: number) => void
  disabled?: boolean
}

const CSAT_EMOJIS = ["😞", "😕", "😐", "🙂", "😊"]
const CSAT_LABELS = ["Very Dissatisfied", "", "", "", "Very Satisfied"]

export function RatingScale({ type, value, onChange, disabled = false }: RatingScaleProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)

  if (type === "csat") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {CSAT_EMOJIS.map((emoji, index) => {
            const score = index + 1
            const isSelected = value === score
            const isHovered = hoveredValue === score

            return (
              <button
                key={score}
                type="button"
                disabled={disabled}
                onClick={() => onChange(score)}
                onMouseEnter={() => setHoveredValue(score)}
                onMouseLeave={() => setHoveredValue(null)}
                className={`
                  w-12 h-12 text-2xl rounded-full transition-all duration-200
                  flex items-center justify-center
                  ${isSelected ? "bg-accent-earthy/20 scale-110 ring-2 ring-accent-earthy" : ""}
                  ${isHovered && !isSelected ? "bg-gray-100 scale-105" : ""}
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}
                `}
                aria-label={`Rate ${score} out of 5`}
                aria-pressed={isSelected}
              >
                {emoji}
              </button>
            )
          })}
        </div>
        <div className="flex justify-between w-full text-xs text-text-earthy/60 px-2">
          <span>{CSAT_LABELS[0]}</span>
          <span>{CSAT_LABELS[4]}</span>
        </div>
      </div>
    )
  }

  if (type === "nps") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: 11 }, (_, i) => i).map((score) => {
            const isSelected = value === score
            const isHovered = hoveredValue === score
            const isPromoter = score >= 9
            const isDetractor = score <= 6

            return (
              <button
                key={score}
                type="button"
                disabled={disabled}
                onClick={() => onChange(score)}
                onMouseEnter={() => setHoveredValue(score)}
                onMouseLeave={() => setHoveredValue(null)}
                className={`
                  w-8 h-10 text-sm font-medium rounded transition-all duration-200
                  flex items-center justify-center border
                  ${isSelected
                    ? isPromoter
                      ? "bg-green-500 text-white border-green-500"
                      : isDetractor
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-yellow-500 text-white border-yellow-500"
                    : "border-gray-200 text-text-earthy"
                  }
                  ${isHovered && !isSelected ? "border-accent-earthy bg-accent-earthy/10" : ""}
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-300"}
                `}
                aria-label={`Rate ${score} out of 10`}
                aria-pressed={isSelected}
              >
                {score}
              </button>
            )
          })}
        </div>
        <div className="flex justify-between w-full text-xs text-text-earthy/60">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </div>
    )
  }

  // CES (1-7 scale)
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((score) => {
          const isSelected = value === score
          const isHovered = hoveredValue === score

          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              onClick={() => onChange(score)}
              onMouseEnter={() => setHoveredValue(score)}
              onMouseLeave={() => setHoveredValue(null)}
              className={`
                w-10 h-10 text-sm font-medium rounded-full transition-all duration-200
                flex items-center justify-center border
                ${isSelected ? "bg-accent-earthy text-white border-accent-earthy" : "border-gray-200 text-text-earthy"}
                ${isHovered && !isSelected ? "border-accent-earthy bg-accent-earthy/10" : ""}
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-300"}
              `}
              aria-label={`Rate ${score} out of 7`}
              aria-pressed={isSelected}
            >
              {score}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between w-full text-xs text-text-earthy/60">
        <span>Very Difficult</span>
        <span>Very Easy</span>
      </div>
    </div>
  )
}

export default RatingScale
