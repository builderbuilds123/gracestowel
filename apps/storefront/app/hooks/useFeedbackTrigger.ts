import { useState, useEffect, useCallback } from "react"

export type TriggerType =
  | "floating_button"
  | "exit_intent"
  | "post_purchase"
  | "time_based"
  | "scroll_depth"
  | "manual"

interface TriggerConfig {
  floatingButton: {
    enabled: boolean
    delay: number // ms before showing button
  }
  exitIntent: {
    enabled: boolean
    sensitivity: number // pixels from top
    cooldownHours: number
  }
  timeBased: {
    enabled: boolean
    delaySeconds: number
    routes: string[] // route patterns to trigger on
  }
  postPurchase: {
    enabled: boolean
    surveyType: "nps" | "csat"
  }
  scrollDepth: {
    enabled: boolean
    threshold: number // percentage 0-100
  }
}

const DEFAULT_CONFIG: TriggerConfig = {
  floatingButton: {
    enabled: true,
    delay: 3000,
  },
  exitIntent: {
    enabled: true,
    sensitivity: 20,
    cooldownHours: 24,
  },
  timeBased: {
    enabled: false,
    delaySeconds: 60,
    routes: ["/products/*"],
  },
  postPurchase: {
    enabled: true,
    surveyType: "nps",
  },
  scrollDepth: {
    enabled: false,
    threshold: 75,
  },
}

const COOLDOWN_KEY = "gt_feedback_cooldown"
const DISMISSED_KEY = "gt_feedback_dismissed"

interface UseFeedbackTriggerResult {
  shouldShowButton: boolean
  shouldShowPopup: boolean
  triggerType: TriggerType | null
  surveyType: "csat" | "nps"
  openPopup: (trigger?: TriggerType) => void
  closePopup: () => void
  dismissButton: () => void
  recordSubmission: () => void
}

export function useFeedbackTrigger(
  currentRoute: string,
  config: Partial<TriggerConfig> = {}
): UseFeedbackTriggerResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  const [showButton, setShowButton] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [triggerType, setTriggerType] = useState<TriggerType | null>(null)
  const [surveyType, setSurveyType] = useState<"csat" | "nps">("csat")

  // Check if we're in cooldown period
  const isInCooldown = useCallback((): boolean => {
    if (typeof window === "undefined") return false
    const cooldownData = localStorage.getItem(COOLDOWN_KEY)
    if (!cooldownData) return false

    try {
      const { timestamp, hours } = JSON.parse(cooldownData)
      const cooldownEnd = timestamp + hours * 60 * 60 * 1000
      return Date.now() < cooldownEnd
    } catch {
      return false
    }
  }, [])

  // Check if button was dismissed this session
  const isDismissed = useCallback((): boolean => {
    if (typeof window === "undefined") return false
    return sessionStorage.getItem(DISMISSED_KEY) === "true"
  }, [])

  // Show floating button after delay
  useEffect(() => {
    if (!mergedConfig.floatingButton.enabled) return
    if (isInCooldown() || isDismissed()) return

    const timer = setTimeout(() => {
      setShowButton(true)
    }, mergedConfig.floatingButton.delay)

    return () => clearTimeout(timer)
  }, [mergedConfig.floatingButton, isInCooldown, isDismissed])

  // Exit intent detection (desktop only)
  useEffect(() => {
    if (!mergedConfig.exitIntent.enabled) return
    if (typeof window === "undefined") return
    if (isInCooldown() || showPopup) return

    // Only on desktop
    if (window.innerWidth < 1024) return

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= mergedConfig.exitIntent.sensitivity) {
        // Check exit intent cooldown
        const exitCooldownKey = "gt_exit_intent_shown"
        if (sessionStorage.getItem(exitCooldownKey)) return

        sessionStorage.setItem(exitCooldownKey, "true")
        setTriggerType("exit_intent")
        setSurveyType("csat")
        setShowPopup(true)
        setShowButton(false)
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave)
    return () => document.removeEventListener("mouseleave", handleMouseLeave)
  }, [mergedConfig.exitIntent, isInCooldown, showPopup])

  // Post-purchase trigger (on checkout success page)
  useEffect(() => {
    if (!mergedConfig.postPurchase.enabled) return
    if (!currentRoute.includes("/checkout/success")) return
    if (isInCooldown()) return

    const postPurchaseKey = "gt_post_purchase_shown"
    if (sessionStorage.getItem(postPurchaseKey)) return

    const timer = setTimeout(() => {
      sessionStorage.setItem(postPurchaseKey, "true")
      setTriggerType("post_purchase")
      setSurveyType(mergedConfig.postPurchase.surveyType)
      setShowPopup(true)
      setShowButton(false)
    }, 2000) // 2 second delay after page load

    return () => clearTimeout(timer)
  }, [currentRoute, mergedConfig.postPurchase, isInCooldown])

  // Time-based trigger
  useEffect(() => {
    if (!mergedConfig.timeBased.enabled) return
    if (isInCooldown()) return

    // Check if current route matches any patterns
    const matchesRoute = mergedConfig.timeBased.routes.some((pattern) => {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
      return regex.test(currentRoute)
    })

    if (!matchesRoute) return

    const timeBasedKey = "gt_time_based_shown"
    if (sessionStorage.getItem(timeBasedKey)) return

    const timer = setTimeout(() => {
      sessionStorage.setItem(timeBasedKey, "true")
      setTriggerType("time_based")
      setSurveyType("csat")
      setShowPopup(true)
      setShowButton(false)
    }, mergedConfig.timeBased.delaySeconds * 1000)

    return () => clearTimeout(timer)
  }, [currentRoute, mergedConfig.timeBased, isInCooldown])

  const openPopup = useCallback((trigger: TriggerType = "floating_button") => {
    setTriggerType(trigger)
    setSurveyType(trigger === "post_purchase" ? "nps" : "csat")
    setShowPopup(true)
    setShowButton(false)
  }, [])

  const closePopup = useCallback(() => {
    setShowPopup(false)
    setTriggerType(null)
    // Show button again after closing (unless dismissed)
    if (!isDismissed() && !isInCooldown()) {
      setShowButton(true)
    }
  }, [isDismissed, isInCooldown])

  const dismissButton = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISSED_KEY, "true")
    }
    setShowButton(false)
  }, [])

  const recordSubmission = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        COOLDOWN_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          hours: 24,
        })
      )
    }
    setShowPopup(false)
    setShowButton(false)
    setTriggerType(null)
  }, [])

  return {
    shouldShowButton: showButton && !showPopup,
    shouldShowPopup: showPopup,
    triggerType,
    surveyType,
    openPopup,
    closePopup,
    dismissButton,
    recordSubmission,
  }
}

export default useFeedbackTrigger
