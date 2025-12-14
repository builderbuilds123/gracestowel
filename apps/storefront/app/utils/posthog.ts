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
 * Web Vitals metric structure from web-vitals v5
 * @see https://github.com/GoogleChrome/web-vitals
 */
interface WebVitalMetric {
  name: 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
  entries: PerformanceEntry[];
}

/**
 * Report Web Vitals to PostHog (Story 4.2)
 * Captures Core Web Vitals: LCP, CLS, INP (replaces FID), FCP, TTFB
 * Each metric includes a rating (good, needs-improvement, poor)
 */
export function reportWebVitals() {
  if (typeof window === 'undefined') return;

  import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    const sendToPostHog = (metric: WebVitalMetric) => {
      posthog.capture('web_vitals', {
        metric_name: metric.name,
        metric_value: metric.value,
        metric_rating: metric.rating, // AC2: good, needs-improvement, poor
        metric_delta: metric.delta,
        metric_id: metric.id,
        navigation_type: metric.navigationType,
        url: window.location.href,
      });
      
      // Debug log in development
      if (import.meta.env.MODE === 'development') {
        console.log(`[WebVitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`);
      }
    };

    // Core Web Vitals
    onCLS(sendToPostHog);  // Cumulative Layout Shift
    onLCP(sendToPostHog);  // Largest Contentful Paint
    onINP(sendToPostHog);  // Interaction to Next Paint (replaces FID)
    
    // Additional metrics
    onFCP(sendToPostHog);  // First Contentful Paint
    onTTFB(sendToPostHog); // Time to First Byte
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
      prevOnunhandledrejection.call(window, event);
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
