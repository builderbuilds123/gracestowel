import { PostHog } from 'posthog-node';



let posthogClient: PostHog | null = null;

/**
 * Context for backend error tracking
 */
export interface ErrorContext {
  component?: string;
  path?: string;
  method?: string;
  userId?: string;
  orderId?: string;
  paymentIntentId?: string;
  [key: string]: unknown;
}

/**
 * Initialize PostHog for server-side event tracking
 * Configured for Railway/serverless environments with immediate flushing
 */
export function initPostHog() {
  const apiKey = process.env.VITE_POSTHOG_API_KEY || process.env.POSTHOG_API_KEY;
  const host = process.env.VITE_POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    console.warn('[PostHog] API key not configured. Server-side tracking disabled.');
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host,
      // Critical for Railway/serverless: flush immediately
      flushAt: 1,
      flushInterval: 0,
    });

    console.info('[PostHog] Server-side tracking initialized');
  }

  return posthogClient;
}

/**
 * Get the PostHog client instance
 * Initializes on first call if not already initialized
 */
export function getPostHog(): PostHog | null {
  if (!posthogClient) {
    return initPostHog();
  }
  return posthogClient;
}

/**
 * Shutdown PostHog client gracefully
 * Call this when the server is shutting down
 */
export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
    console.info('[PostHog] Client shutdown');
  }
}

/**
 * Capture a backend error in PostHog (Story 4.4)
 * 
 * Sends a `backend_error` event with error details and context.
 * Used by the global error handler middleware and can be called
 * directly for caught exceptions.
 * 
 * @param error - The error object
 * @param context - Additional context about where/why the error occurred
 */
export function captureBackendError(error: Error, context: ErrorContext = {}) {
  const client = getPostHog();
  if (!client) return;

  // Destructure known keys, collect rest for additional context
  const {
    userId,
    component,
    path,
    method,
    orderId,
    paymentIntentId,
    ...restOfContext
  } = context;

  const distinctId = userId || 'system';

  client.capture({
    distinctId,
    event: 'backend_error',
    properties: {
      // Error details
      $exception_type: error.name,
      $exception_message: error.message,
      $exception_stack_trace_raw: error.stack,
      
      // Context
      component: component || 'unknown',
      path,
      method,
      
      // Business context (if available)
      order_id: orderId,
      payment_intent_id: paymentIntentId,
      
      // Additional context (rest params exclude known keys automatically)
      ...restOfContext,
      
      // Environment (always set by system, overwrites any user-provided values)
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Capture a critical business event (e.g., payment failure)
 * 
 * @param eventName - Name of the business event
 * @param properties - Event properties
 * @param distinctId - User ID or 'system' for system events
 */
export function captureBusinessEvent(
  eventName: string,
  properties: Record<string, unknown>,
  distinctId: string = 'system'
) {
  const client = getPostHog();
  if (!client) return;

  client.capture({
    distinctId,
    event: eventName,
    properties: {
      ...properties,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
}

export default { 
  initPostHog, 
  getPostHog, 
  shutdownPostHog, 
  captureBackendError,
  captureBusinessEvent 
};
