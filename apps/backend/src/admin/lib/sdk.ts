import Medusa from "@medusajs/js-sdk"

// In browser/admin context, use relative URLs or window.location.origin
// process.env is not available in browser, so we use window.location for same-origin requests
const getBaseUrl = () => {
  // Check if we're in browser environment
  if (typeof window !== "undefined") {
    // Use relative URL for same-origin requests (admin and API are on same server)
    return window.location.origin
  }
  // Fallback for SSR/build time (shouldn't happen in admin routes)
  return process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
}

export const sdk = new Medusa({
  baseUrl: getBaseUrl(),
  debug: typeof window !== "undefined" ? window.location.hostname === "localhost" : false,
  auth: {
    type: "session",
  },
})
