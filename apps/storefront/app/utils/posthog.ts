import posthog from 'posthog-js';

/**
 * Initialize PostHog for client-side analytics and monitoring
 * Only active in production or when explicitly enabled via env var
 */
export function initPostHog() {
  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    return;
  }

  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
  
  // Only initialize if API key is provided
  if (!apiKey) {
    console.warn('[PostHog] API key not configured. Skipping initialization.');
    return;
  }

  // Initialize PostHog
  posthog.init(apiKey, {
    api_host: host,
    
    // Enable session recording
    session_recording: {
      recordCrossOriginIframes: true,
    },
    
    // Automatically capture pageviews
    capture_pageview: true,
    
    // Automatically capture performance metrics
    capture_performance: true,
    
    // Enable autocapture for clicks and form submissions
    autocapture: true,
    
    // Respect user privacy
    respect_dnt: true,

    // Explicitly enable persistence (localStorage+cookie) as per architecture policy
    persistence: 'localStorage+cookie',
    
    // Debugging (only in development)
    loaded: (posthog) => {
      if (import.meta.env.MODE === 'development') {
        console.log('[PostHog] Successfully initialized');
        posthog.debug();
      }
    },
  });
}

/**
 * Get the PostHog instance
 * Safe to call even if PostHog is not initialized
 */
export function getPostHog() {
  if (typeof window === 'undefined') {
    return null;
  }
  return posthog;
}

/**
 * Report Web Vitals to PostHog
 */
export function reportWebVitals() {
  if (typeof window === 'undefined') return;

  import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    const sendToPostHog = (metric: any) => {
      posthog.capture('$performance_event', {
        ...metric,
        url: window.location.href,
      });
    };

    onCLS(sendToPostHog);
    onINP(sendToPostHog);
    onLCP(sendToPostHog);
    onFCP(sendToPostHog);
    onTTFB(sendToPostHog);
  });
}

/**
 * Setup global error tracking for PostHog (Story 4.1)
 * Captures unhandled errors and promise rejections
 * Chains with existing handlers to avoid clobbering other error trackers (M1 fix)
 */
export function setupErrorTracking() {
  if (typeof window === 'undefined') return;

  // Store existing handlers to chain them (M1: Don't clobber other error trackers)
  const prevOnerror = window.onerror;
  const prevOnunhandledrejection = window.onunhandledrejection;

  // Track unhandled JavaScript errors
  window.onerror = (message, source, lineno, colno, error) => {
    posthog.capture('$exception', {
      $exception_type: error?.name || 'Error',
      $exception_message: typeof message === 'string' ? message : 'Unknown error',
      $exception_source: source,
      $exception_lineno: lineno,
      $exception_colno: colno,
      $exception_stack_trace_raw: error?.stack,
      $exception_handled: false,
      $exception_synthetic: false,
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
    
    // Chain to previous handler if it exists
    if (prevOnerror) {
      return prevOnerror(message, source, lineno, colno, error);
    }
    
    // Don't prevent default error handling
    return false;
  };

  // Track unhandled promise rejections
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;
    const isError = error instanceof Error;
    
    posthog.capture('$exception', {
      $exception_type: isError ? error.name : 'UnhandledPromiseRejection',
      $exception_message: isError ? error.message : String(error),
      $exception_stack_trace_raw: isError ? error.stack : undefined,
      $exception_handled: false,
      $exception_synthetic: false,
      $exception_is_promise_rejection: true,
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
    
    // Chain to previous handler if it exists
    if (prevOnunhandledrejection) {
      prevOnunhandledrejection(event);
    }
  };

  // Only log in development (L1 fix)
  if (import.meta.env.MODE === 'development') {
    console.log('[PostHog] Error tracking initialized');
  }
}

/**
 * Capture a handled exception manually
 * Use this to track errors that are caught but still significant
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  
  posthog.capture('$exception', {
    $exception_type: error.name,
    $exception_message: error.message,
    $exception_stack_trace_raw: error.stack,
    $exception_handled: true,
    $exception_synthetic: false,
    url: window.location.href,
    user_agent: navigator.userAgent, // L2 fix: consistent with auto-captured exceptions
    ...context,
  });
}

export default posthog;
