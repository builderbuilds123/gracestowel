import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

/**
 * Initialize PostHog for server-side event tracking
 * Configured for Railway/serverless environments with immediate flushing
 */
export function initPostHog() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

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

    console.log('[PostHog] Server-side tracking initialized');
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
    console.log('[PostHog] Client shutdown');
  }
}

export default { initPostHog, getPostHog, shutdownPostHog };
