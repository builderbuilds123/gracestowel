import { useState, useEffect, useCallback } from "react"
import { useLocation } from "react-router"
import { useCart } from "../context/CartContext"
import { useCustomer } from "../context/CustomerContext"

export interface FeedbackContextData {
  // Page
  pageUrl: string
  pageRoute: string
  pageTitle: string | null
  referrer: string | null

  // Product (if on product page)
  product: {
    id: string
    handle: string
    title: string
    selectedVariantId: string | null
    selectedOptions: Record<string, string>
  } | null

  // Cart
  cart: {
    itemCount: number
    total: number
    items: Array<{ id: string; title: string; quantity: number; price: number }>
  }

  // User
  user: {
    customerId: string | null
    sessionId: string
    locale: string
    region: string
  }

  // Session
  session: {
    timeOnPage: number
    scrollDepth: number
    viewportWidth: number
    viewportHeight: number
    deviceType: "mobile" | "tablet" | "desktop"
    userAgent: string
    touchEnabled: boolean
    connectionType: string | null
  }
}

const SESSION_ID_KEY = "gt_feedback_session_id"

function generateSessionId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return generateSessionId()
  }

  let sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!sessionId) {
    sessionId = generateSessionId()
    localStorage.setItem(SESSION_ID_KEY, sessionId)
  }
  return sessionId
}

function getDeviceType(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

function getConnectionType(): string | null {
  if (typeof navigator === "undefined") return null
  const nav = navigator as any
  if (nav.connection) {
    return nav.connection.effectiveType || nav.connection.type || null
  }
  return null
}

export function useFeedbackContext(productData?: {
  id?: string
  handle?: string
  title?: string
  selectedVariantId?: string
  selectedOptions?: Record<string, string>
}): FeedbackContextData {
  const location = useLocation()
  const { items, cartTotal } = useCart()
  const { customer } = useCustomer()

  const [pageLoadTime] = useState(() => Date.now())
  const [scrollDepth, setScrollDepth] = useState(0)

  // Track scroll depth
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight > 0) {
        const depth = Math.min(100, Math.round((scrollTop / docHeight) * 100))
        setScrollDepth((prev) => Math.max(prev, depth))
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const getContext = useCallback((): FeedbackContextData => {
    const now = Date.now()
    const timeOnPage = Math.round((now - pageLoadTime) / 1000)

    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768

    return {
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      pageRoute: location.pathname,
      pageTitle: typeof document !== "undefined" ? document.title : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,

      product: productData?.id
        ? {
            id: productData.id,
            handle: productData.handle || "",
            title: productData.title || "",
            selectedVariantId: productData.selectedVariantId || null,
            selectedOptions: productData.selectedOptions || {},
          }
        : null,

      cart: {
        itemCount: items.length,
        total: cartTotal,
        items: items.map((item) => ({
          id: typeof item.id === "string" ? item.id : item.id.id,
          title: item.title,
          quantity: item.quantity,
          price: parseFloat(item.price.replace(/[^0-9.]/g, "")) * 100,
        })),
      },

      user: {
        customerId: customer?.id || null,
        sessionId: getOrCreateSessionId(),
        locale: typeof navigator !== "undefined" ? navigator.language : "en",
        region: null, // Region determined by backend from cart/session
      },

      session: {
        timeOnPage,
        scrollDepth,
        viewportWidth,
        viewportHeight,
        deviceType: getDeviceType(viewportWidth),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        touchEnabled:
          typeof window !== "undefined" && "ontouchstart" in window,
        connectionType: getConnectionType(),
      },
    }
  }, [location, items, cartTotal, customer, productData, pageLoadTime, scrollDepth])

  return getContext()
}

export default useFeedbackContext
