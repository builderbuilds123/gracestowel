/**
 * Structured Logger for Railway/Production Environments
 * 
 * Outputs JSON logs that are:
 * - Searchable in Railway's log viewer
 * - Filterable by level, component, and custom fields
 * - Compatible with log aggregation tools (Datadog, Logtail, etc.)
 * - Automatically piped to analytics for analysis
 * 
 * Usage:
 *   import { logger } from "../utils/logger";
 *   logger.info("webhook", "Event received", { eventId: "evt_123", type: "payment_intent.succeeded" });
 *   logger.error("worker", "Processing failed", { orderId: "order_123" }, error);
 */

import { maskProperties } from "./analytics";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  [key: string]: unknown;
}

type AnalyticsServiceLike = {
  track: (data: {
    event: string;
    actor_id?: string;
    properties?: Record<string, unknown>;
  }) => Promise<void> | void;
};

let analyticsService: AnalyticsServiceLike | null = null;

export const setAnalyticsServiceForLogger = (service: AnalyticsServiceLike | null) => {
  analyticsService = service;
};

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
 * Send log entry to analytics as an event
 * Only sends warn/error/critical by default, or info for tracked components
 */
function sendToAnalytics(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): void {
  try {
    if (level === "debug") return;
    if (!analyticsService) return;

    const properties = maskProperties({
      component,
      message,
      level,
      ...(data || {}),
      ...(error && {
        error_name: error.name,
        error_message: error.message,
      }),
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });

    analyticsService.track({
      event: `log.${level}`,
      properties,
    });
  } catch (e) {
    // Silently fail - never break logging flow
  }
}

export const logger = {
  debug(component: string, message: string, data?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(formatLog("debug", component, message, data));
    }
    // Debug logs are never sent to analytics
  },

  info(component: string, message: string, data?: Record<string, unknown>): void {
    console.log(formatLog("info", component, message, data));
    sendToAnalytics("info", component, message, data);
  },

  warn(component: string, message: string, data?: Record<string, unknown>): void {
    console.warn(formatLog("warn", component, message, data));
    sendToAnalytics("warn", component, message, data);
  },

  error(component: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    console.error(formatLog("error", component, message, data, error));
    sendToAnalytics("error", component, message, data, error);
  },

  /**
   * Critical errors that need immediate attention
   * Prefixed with [CRITICAL] for easy filtering
   */
  critical(component: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    console.error(formatLog("error", component, `[CRITICAL] ${message}`, data, error));
    sendToAnalytics("error", component, `[CRITICAL] ${message}`, { ...data, is_critical: true }, error);
  },
};

export default logger;
