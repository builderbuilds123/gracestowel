/**
 * Structured Logger for Railway/Production Environments
 * 
 * Outputs JSON logs that are:
 * - Searchable in Railway's log viewer
 * - Filterable by level, component, and custom fields
 * - Compatible with log aggregation tools (Datadog, Logtail, etc.)
 * - Automatically piped to PostHog for analysis (warn/error/critical levels)
 * 
 * Usage:
 *   import { logger } from "../utils/logger";
 *   logger.info("webhook", "Event received", { eventId: "evt_123", type: "payment_intent.succeeded" });
 *   logger.error("worker", "Processing failed", { orderId: "order_123" }, error);
 */

import { getPostHog } from "./posthog";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  [key: string]: unknown;
}

// Components that should always send logs to PostHog (even info level)
const POSTHOG_TRACKED_COMPONENTS = [
  "stripe-worker",
  "webhook",
  "payment-capture",
  "email-queue",
];

// Whether to send info-level logs to PostHog (can be toggled via env)
const POSTHOG_LOG_INFO = process.env.POSTHOG_LOG_INFO === "true";

function formatLog(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines of stack
    };
  }

  return JSON.stringify(entry);
}

/**
 * Send log entry to PostHog as an event
 * Only sends warn/error/critical by default, or info for tracked components
 */
function sendToPostHog(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): void {
  // Skip debug logs entirely
  if (level === "debug") return;

  // For info level, only send if explicitly enabled or component is tracked
  if (level === "info" && !POSTHOG_LOG_INFO && !POSTHOG_TRACKED_COMPONENTS.includes(component)) {
    return;
  }

  try {
    const posthog = getPostHog();
    if (!posthog) return;

    // Determine distinct ID from data if available
    const distinctId = (data?.userId as string) || 
                       (data?.customerId as string) || 
                       (data?.orderId ? `order_${data.orderId}` : null) ||
                       (data?.paymentIntentId ? `pi_${data.paymentIntentId}` : null) ||
                       "system";

    posthog.capture({
      distinctId,
      event: `backend_log_${level}`,
      properties: {
        component,
        message,
        level,
        ...data,
        // Error details if present (no stack to avoid PII leakage)
        ...(error && {
          error_name: error.name,
          error_message: error.message,
          // Removed: error_stack - can contain PII and sensitive paths
        }),
        // Environment context
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    // Silently fail - don't let PostHog issues break logging
    console.error("[Logger] Failed to send to PostHog:", e);
  }
}

export const logger = {
  debug(component: string, message: string, data?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(formatLog("debug", component, message, data));
    }
    // Debug logs are never sent to PostHog
  },

  info(component: string, message: string, data?: Record<string, unknown>): void {
    console.log(formatLog("info", component, message, data));
    // Send to PostHog for tracked components (stripe-worker, webhook, etc.)
    sendToPostHog("info", component, message, data);
  },

  warn(component: string, message: string, data?: Record<string, unknown>): void {
    console.warn(formatLog("warn", component, message, data));
    // Always send warnings to PostHog
    sendToPostHog("warn", component, message, data);
  },

  error(component: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    console.error(formatLog("error", component, message, data, error));
    // Always send errors to PostHog
    sendToPostHog("error", component, message, data, error);
  },

  /**
   * Critical errors that need immediate attention
   * Prefixed with [CRITICAL] for easy filtering
   */
  critical(component: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    console.error(formatLog("error", component, `[CRITICAL] ${message}`, data, error));
    // Always send critical errors to PostHog with special event name
    sendToPostHog("error", component, `[CRITICAL] ${message}`, { ...data, is_critical: true }, error);
  },
};

export default logger;
