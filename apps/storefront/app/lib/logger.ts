/**
 * Structured logger for payment flow tracing
 * Generates trace IDs that can be correlated across frontend → backend → Stripe
 */

export interface LogContext {
  traceId: string;
  orderId?: string;
  paymentIntentId?: string;
  customerId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Generate a unique trace ID for correlating logs across the payment flow
 * Format: gt_{timestamp}_{random} (gt = gracestowel)
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `gt_${timestamp}_${random}`;
}

/**
 * Create a logger instance with a specific trace context
 */
export function createLogger(context: Partial<LogContext> = {}) {
  const traceId = context.traceId || generateTraceId();
  const baseContext: LogContext = { traceId, ...context };

  const formatEntry = (
    level: LogEntry["level"],
    message: string,
    extra?: Record<string, unknown>,
    error?: Error
  ): LogEntry => ({
    timestamp: new Date().toISOString(),
    level,
    message,
    context: { ...baseContext, ...extra },
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }),
  });

  const log = (entry: LogEntry) => {
    const output = JSON.stringify(entry);
    switch (entry.level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  };

  return {
    traceId,

    info(message: string, extra?: Record<string, unknown>) {
      log(formatEntry("info", message, extra));
    },

    warn(message: string, extra?: Record<string, unknown>) {
      log(formatEntry("warn", message, extra));
    },

    error(message: string, error?: Error, extra?: Record<string, unknown>) {
      log(formatEntry("error", message, extra, error));
    },

    /**
     * Create a child logger with additional context
     */
    child(additionalContext: Partial<LogContext>) {
      return createLogger({ ...baseContext, ...additionalContext });
    },
  };
}

/**
 * Parse a trace ID from request headers or generate new one
 */
export function getTraceIdFromRequest(request: Request): string {
  return request.headers.get("x-trace-id") || generateTraceId();
}
