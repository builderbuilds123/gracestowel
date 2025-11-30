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

export default posthog;
