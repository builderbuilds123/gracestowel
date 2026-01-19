import posthog from 'posthog-js';

/**
 * PostHog Survey IDs - Created via PostHog MCP
 * These are used for programmatic survey triggers (API-based surveys)
 */
export const POSTHOG_SURVEY_IDS = {
  OPEN_FEEDBACK: '019bd4c4-b299-0000-a365-bda3737bc1a2',
  NPS: '019bd4c4-b63c-0000-c368-0c8d7ffd8860',
  CSAT: '019bd4c4-b958-0000-bc7c-9f7b2b67eebe',
  POST_PURCHASE: '019bd4c4-bc5b-0000-b0eb-05a1ed724025',
  CES: '019bd4c4-f0e9-0000-2d22-9e15e664946a',
  FEATURE_REQUEST: '019bd4c4-f385-0000-eb56-c4bdc86b5496',
  ERROR_FEEDBACK: '019bd4c4-f695-0000-1c70-613b7370358c',
  ATTRIBUTION: '019bd4c4-f9b9-0000-2ca0-c9790f2e9792',
  BETA_FEEDBACK: '019bd4c4-fc65-0000-ce38-809d7a924e9d',
} as const;

/**
 * Get sanitized URL (strips sensitive query params like tokens)
 * Prevents leaking auth tokens to analytics
 */
function getSanitizedUrl(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  // Remove sensitive query parameters
  const sensitiveParams = ['token', 'auth', 'key', 'secret', 'password', 'jwt'];
  sensitiveParams.forEach(param => url.searchParams.delete(param));
  return url.toString();
}

/**
 * Initialize PostHog for client-side analytics and monitoring
 * Only active in production or when explicitly enabled via env var
 * 
 * Supports both build-time (VITE_*) and runtime (window.ENV) configuration
 * Runtime config from Cloudflare Workers takes precedence
 */
export function initPostHog() {
  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    return;
  }

  // Try runtime config first (from Cloudflare Workers via window.ENV)
  // Fallback to build-time config (VITE_* env vars)
  const runtimeConfig = (window as any).ENV;
  const apiKey = runtimeConfig?.VITE_POSTHOG_API_KEY || runtimeConfig?.POSTHOG_API_KEY || import.meta.env.VITE_POSTHOG_API_KEY;
  const host = runtimeConfig?.VITE_POSTHOG_HOST || runtimeConfig?.POSTHOG_HOST || import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  
  // Only initialize if API key is provided
  if (!apiKey) {
    console.warn('[PostHog] API key not configured. Skipping initialization.');
    console.warn('[PostHog] Checked:', {
      runtime: !!(runtimeConfig?.VITE_POSTHOG_API_KEY || runtimeConfig?.POSTHOG_API_KEY),
      buildTime: !!import.meta.env.VITE_POSTHOG_API_KEY,
    });
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

    // Explicitly enable persistence (localStorage+cookie) as per architecture policy
    persistence: 'localStorage+cookie',

    // Enable surveys (PostHog native surveys)
    disable_surveys: false,

    // Debugging (only in development)
    loaded: (posthog) => {
      if (import.meta.env.MODE === 'development') {
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
export interface WebVitalMetric {
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
        url: getSanitizedUrl(),
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
      url: getSanitizedUrl(),
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
      url: getSanitizedUrl(),
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
 * Optionally triggers the error feedback survey
 */
export function captureException(error: Error, context?: Record<string, unknown>, triggerSurvey = false) {
  if (typeof window === 'undefined') return;

  posthog.capture('$exception', {
    $exception_type: error.name,
    $exception_message: error.message,
    $exception_stack_trace_raw: error.stack,
    $exception_handled: true,
    $exception_synthetic: false,
    url: getSanitizedUrl(),
    user_agent: navigator.userAgent, // L2 fix: consistent with auto-captured exceptions
    ...context,
  });

  // Optionally trigger error feedback survey
  if (triggerSurvey) {
    triggerErrorFeedbackSurvey();
  }
}

/**
 * Trigger the error feedback survey programmatically
 * Uses session-based cooldown to prevent survey fatigue
 */
export function triggerErrorFeedbackSurvey() {
  if (typeof window === 'undefined') return;

  const COOLDOWN_KEY = 'ph_error_feedback_shown';
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Check cooldown
  try {
    const lastShown = sessionStorage.getItem(COOLDOWN_KEY);
    if (lastShown) {
      const elapsed = Date.now() - parseInt(lastShown, 10);
      if (elapsed < COOLDOWN_MS) {
        return; // Still in cooldown
      }
    }

    // Mark as shown
    sessionStorage.setItem(COOLDOWN_KEY, Date.now().toString());

    // Capture survey shown event - PostHog will render the survey
    posthog.capture('survey shown', {
      $survey_id: POSTHOG_SURVEY_IDS.ERROR_FEEDBACK,
    });
  } catch {
    // Storage access failed (private mode, etc.) - skip survey
  }
}

export default posthog;
