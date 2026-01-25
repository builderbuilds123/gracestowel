/**
 * User-Friendly Error Messages
 * 
 * Story 4.1: Map API error codes to human-readable messages
 * 
 * Provides clear, actionable error messages without exposing internal details
 * (no timestamps, amounts, or technical codes to users).
 * 
 * @see docs/product/epics/order-modification-v2.md Story 4.1
 */

export interface ErrorDisplay {
  title: string;
  message: string;
  action?: string;
}

export const ORDER_ERROR_MESSAGES: Record<string, ErrorDisplay> = {
  ORDER_FULFILLED: {
    title: "Order Already Shipped",
    message: "This order has already shipped and cannot be modified.",
    action: "Contact support if you need assistance.",
  },
  PAYMENT_CAPTURED: {
    title: "Payment Processed",
    message: "Payment has been processed for this order.",
    action: "Contact support to make changes.",
  },
  PAYMENT_AUTH_INVALID: {
    title: "Session Expired",
    message: "The modification window for this order has closed.",
    action: "Please contact support or place a new order.",
  },
  PAYMENT_NOT_FOUND: {
    title: "Order Issue",
    message: "Unable to retrieve payment information.",
    action: "Please contact support.",
  },
  PAYMENT_STATUS_INVALID: {
    title: "Payment Issue",
    message: "This order cannot be modified due to payment status.",
    action: "Please contact support.",
  },
  RATE_LIMITED: {
    title: "Too Many Requests",
    message: "You've made too many requests.",
    action: "Please wait a moment and try again.",
  },
  UNAUTHORIZED: {
    title: "Access Denied",
    message: "You don't have permission to view this order.",
    action: "Check your email for the order link or sign in.",
  },
  EDIT_NOT_ALLOWED: {
    title: "Cannot Edit Order",
    message: "This order cannot be modified at this time.",
    action: "Contact support for assistance.",
  },
  ORDER_NOT_FOUND: {
    title: "Order Not Found",
    message: "We couldn't find this order.",
    action: "Please check your order number or contact support.",
  },
  TOKEN_EXPIRED: {
    title: "Link Expired",
    message: "This modification link has expired for security reasons.",
    action: "Please contact support or place a new order.",
  },
  TOKEN_INVALID: {
    title: "Invalid Link",
    message: "This link is not valid.",
    action: "Check your email for the correct order link or sign in.",
  },
  TOKEN_MISMATCH: {
    title: "Invalid Access",
    message: "This link does not match the order.",
    action: "Please use the correct order link from your email.",
  },
  TOKEN_REQUIRED: {
    title: "Access Required",
    message: "Please sign in or use the order link from your email.",
    action: "Check your email for the order link or sign in.",
  },
  ELIGIBILITY_CHECK_FAILED: {
    title: "Unable to Verify",
    message: "We couldn't verify if this order can be modified.",
    action: "Please contact support.",
  },
  WINDOW_EXPIRED: {
    title: "Modification Window Closed",
    message: "The time to modify this order has passed.",
    action: "Please contact support or place a new order.",
  },
  ORDER_CANCELED: {
    title: "Order Canceled",
    message: "This order has been canceled and cannot be modified.",
    action: "Please place a new order if you'd like to purchase.",
  },
  ORDER_SHIPPED: {
    title: "Order Shipped",
    message: "This order has shipped and cannot be modified.",
    action: "Track your order or contact support if needed.",
  },
  ORDER_DELIVERED: {
    title: "Order Delivered",
    message: "This order has been delivered.",
    action: "If you need to return an item, please use the return option.",
  },
  not_editable: {
    title: "Cannot Modify Order",
    message: "This order can no longer be modified.",
    action: "Contact support if you need assistance.",
  },
  state_changed: {
    title: "Order Status Changed",
    message: "The order status has changed since you started editing.",
    action: "Please review the current order status.",
  },
};

/**
 * Get user-friendly error display for an error code
 * 
 * @param errorCode - The error code from the API
 * @returns ErrorDisplay with title, message, and optional action
 */
export function getErrorDisplay(errorCode: string | undefined | null): ErrorDisplay {
  if (!errorCode || typeof errorCode !== 'string') {
    return ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED;
  }
  
  return ORDER_ERROR_MESSAGES[errorCode] || ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED;
}
