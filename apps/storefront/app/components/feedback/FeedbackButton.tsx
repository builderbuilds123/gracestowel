import { useState, useEffect } from "react"
import { MessageSquare, X } from "lucide-react"

interface FeedbackButtonProps {
  onClick: () => void
  onDismiss: () => void
  visible: boolean
}

export function FeedbackButton({ onClick, onDismiss, visible }: FeedbackButtonProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // Animate in when becoming visible
  useEffect(() => {
    if (visible) {
      // Small delay for animation
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
    }
  }, [visible])

  // Collapse on scroll (show only icon)
  useEffect(() => {
    if (!visible) return

    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY && currentScrollY > 200) {
        setIsCollapsed(true)
      } else if (currentScrollY < lastScrollY - 50) {
        setIsCollapsed(false)
      }
      lastScrollY = currentScrollY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-40
        transition-all duration-300 ease-out
        ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}
      `}
    >
      <div className="relative group">
        {/* Dismiss button (visible on hover) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-gray-100 rounded-full 
                   flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity
                   hover:bg-gray-200 text-gray-500"
          aria-label="Dismiss feedback button"
        >
          <X className="w-3 h-3" />
        </button>

        {/* Main button */}
        <button
          onClick={onClick}
          className={`
            flex items-center gap-2 
            bg-accent-earthy text-white 
            rounded-full shadow-lg
            hover:bg-accent-earthy/90 hover:shadow-xl
            transition-all duration-300
            ${isCollapsed ? "px-3 py-3" : "px-4 py-3"}
          `}
          aria-label="Open feedback form"
        >
          <MessageSquare className="w-5 h-5" />
          <span
            className={`
              font-medium text-sm whitespace-nowrap
              transition-all duration-300 overflow-hidden
              ${isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"}
            `}
          >
            Feedback
          </span>
        </button>
      </div>
    </div>
  )
}

export default FeedbackButton
