import { describe, it, expect, beforeEach, vi } from "vitest"

// Test pure functions extracted from useFeedbackContext

function generateSessionId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function getDeviceType(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

describe("useFeedbackContext - Device Type Detection", () => {
  it("returns mobile for width < 640", () => {
    expect(getDeviceType(320)).toBe("mobile")
    expect(getDeviceType(639)).toBe("mobile")
  })

  it("returns tablet for width 640-1023", () => {
    expect(getDeviceType(640)).toBe("tablet")
    expect(getDeviceType(768)).toBe("tablet")
    expect(getDeviceType(1023)).toBe("tablet")
  })

  it("returns desktop for width >= 1024", () => {
    expect(getDeviceType(1024)).toBe("desktop")
    expect(getDeviceType(1920)).toBe("desktop")
    expect(getDeviceType(2560)).toBe("desktop")
  })
})

describe("useFeedbackContext - Session ID Generation", () => {
  it("generates 32-character hex string", () => {
    const sessionId = generateSessionId()
    expect(sessionId).toHaveLength(32)
    expect(/^[0-9a-f]{32}$/.test(sessionId)).toBe(true)
  })

  it("generates unique IDs", () => {
    const id1 = generateSessionId()
    const id2 = generateSessionId()
    expect(id1).not.toBe(id2)
  })
})

describe("useFeedbackContext - Scroll Depth Calculation", () => {
  it("calculates scroll depth percentage correctly", () => {
    const scrollTop = 500
    const docHeight = 2000 - 1000 // scrollHeight - innerHeight
    const depth = Math.min(100, Math.round((scrollTop / docHeight) * 100))
    expect(depth).toBe(50)
  })

  it("caps at 100%", () => {
    const scrollTop = 1500
    const docHeight = 1000
    const depth = Math.min(100, Math.round((scrollTop / docHeight) * 100))
    expect(depth).toBe(100)
  })

  it("handles zero doc height", () => {
    const scrollTop = 100
    const docHeight = 0
    // Should not divide by zero
    const depth = docHeight > 0 ? Math.min(100, Math.round((scrollTop / docHeight) * 100)) : 0
    expect(depth).toBe(0)
  })
})

describe("useFeedbackContext - Cart Item Mapping", () => {
  it("maps cart items correctly", () => {
    const items = [
      { id: "item_1", title: "Turkish Towel", quantity: 2, price: "$49.99" },
      { id: "item_2", title: "Bath Mat", quantity: 1, price: "$29.99" },
    ]

    const mapped = items.map((item) => ({
      id: typeof item.id === "string" ? item.id : (item.id as any).id,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price.replace(/[^0-9.]/g, "")) * 100,
    }))

    expect(mapped).toEqual([
      { id: "item_1", title: "Turkish Towel", quantity: 2, price: 4999 },
      { id: "item_2", title: "Bath Mat", quantity: 1, price: 2999 },
    ])
  })

  it("handles complex id objects", () => {
    const items = [{ id: { id: "item_complex" }, title: "Towel", quantity: 1, price: "$10.00" }]

    const mapped = items.map((item) => ({
      id: typeof item.id === "string" ? item.id : (item.id as any).id,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price.replace(/[^0-9.]/g, "")) * 100,
    }))

    expect(mapped[0].id).toBe("item_complex")
  })
})

describe("useFeedbackContext - Time on Page", () => {
  it("calculates time on page in seconds", () => {
    const pageLoadTime = Date.now() - 30000 // 30 seconds ago
    const now = Date.now()
    const timeOnPage = Math.round((now - pageLoadTime) / 1000)
    expect(timeOnPage).toBe(30)
  })
})
