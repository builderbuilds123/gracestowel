/**
 * PostHog Debug Utility
 * Use this to diagnose PostHog initialization issues
 */

export function debugPostHogConfig() {
  if (typeof window === 'undefined') {
    console.log('[PostHog Debug] Running on server - PostHog not available');
    return;
  }

  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  
  console.group('[PostHog Debug] Configuration Check');
  console.log('API Key present:', !!apiKey);
  console.log('API Key length:', apiKey ? apiKey.length : 0);
  console.log('API Key preview:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
  console.log('Host:', host);
  console.log('Environment mode:', import.meta.env.MODE);
  console.log('All VITE env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
  console.groupEnd();

  // Check if PostHog is actually initialized
  try {
    // @ts-expect-error - posthog might not be initialized
    const ph = window.posthog;
    if (ph) {
      console.log('[PostHog Debug] PostHog instance found:', {
        hasInit: typeof ph.init === 'function',
        hasCapture: typeof ph.capture === 'function',
        distinctId: ph.get_distinct_id?.() || 'unknown',
      });
    } else {
      console.warn('[PostHog Debug] PostHog instance NOT found on window');
    }
  } catch (e) {
    console.error('[PostHog Debug] Error checking PostHog:', e);
  }
}

// Auto-run in development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', debugPostHogConfig);
  } else {
    debugPostHogConfig();
  }
}
