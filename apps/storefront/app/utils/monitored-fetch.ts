/**
 * Monitored Fetch Utility (Story 4.3, Enhanced in Story 5.1)
 * Wraps fetch calls to track API latency and errors in PostHog
 */

type PostHogLike = {
  capture: (event: string, properties?: any) => void;
  isFeatureEnabled?: (flag: string) => boolean;
};

type ServerPostHogConfig = {
  apiKey: string;
  host: string;
};

let posthogPromise: Promise<PostHogLike> | null = null;

function getServerPosthogConfig(): ServerPostHogConfig | null {
  // Check for injected ENV in browser or global scope
  const globalEnv = (typeof window !== 'undefined' ? (window as any).ENV : (globalThis as any).ENV) as
    | { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string }
    | undefined;

  const apiKey =
    globalEnv?.POSTHOG_API_KEY ??
    (typeof process !== 'undefined' ? process.env.POSTHOG_API_KEY : undefined);

  const host =
    globalEnv?.POSTHOG_HOST ??
    (typeof process !== 'undefined' ? process.env.POSTHOG_HOST : undefined) ??
    'https://us.i.posthog.com';

  if (!apiKey) return null;

  return { apiKey, host };
}

function normalizePosthogHost(host: string): string {
  return host.replace(/\/+$/, '');
}

async function captureServerEvent(
  event: string,
  properties: any
): Promise<void> {
  const cfg = getServerPosthogConfig();
  if (!cfg) return;

  try {
    await fetch(`${normalizePosthogHost(cfg.host)}/capture/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        api_key: cfg.apiKey,
        event,
        distinct_id: 'server',
        properties,
      }),
    });
  } catch {
    return;
  }
}

async function getPosthog(): Promise<PostHogLike | null> {
  if (typeof window === 'undefined') return null;

  if (!posthogPromise) {
    posthogPromise = import('posthog-js').then((m) => (m as any).default ?? (m as any));
  }

  try {
    return await posthogPromise;
  } catch {
    return null;
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getBaseOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
}

function scheduleMicrotask(fn: () => void) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }
  void Promise.resolve().then(fn);
}

/**
 * API request event payload for PostHog
 */
export interface ApiRequestEvent {
  url: string;
  method: string;
  status: number;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  request_path: string;
  request_host: string;
  label?: string;
  route?: string; // Current page route (Story 5.1)
}

/**
 * Get current route path (for tracking context)
 */
function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

/**
 * Options for monitored fetch
 */
export interface MonitoredFetchOptions extends RequestInit {
  /** Skip PostHog tracking for this request */
  skipTracking?: boolean;
  /** Custom label for the request (e.g., "payment-intent-create") */
  label?: string;
}

/**
 * Get sanitized URL path (strips query params with sensitive data)
 */
function getSanitizedPath(url: string): string {
  try {
    const urlObj = new URL(url, getBaseOrigin());
    const allowedParams = new Set([
      'id',
      'handle',
      'slug',
      'limit',
      'offset',
      'page',
      'per_page',
      'sort',
      'order',
      'region_id',
      'currency_code',
      'variant_id',
      'product_id',
    ]);

    for (const key of Array.from(urlObj.searchParams.keys())) {
      if (!allowedParams.has(key)) {
        urlObj.searchParams.delete(key);
      }
    }

    return urlObj.pathname + (urlObj.search || '');
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/**
 * Parse URL to extract host and path
 */
function parseUrl(url: string): { host: string; path: string } {
  try {
    const urlObj = new URL(url, getBaseOrigin());
    return {
      host: urlObj.host,
      path: urlObj.pathname,
    };
  } catch {
    return {
      host: 'unknown',
      path: url,
    };
  }
}

/**
 * Monitored fetch - wraps native fetch with PostHog tracking
 * 
 * Captures:
 * - Request URL, method, status
 * - Duration (ms)
 * - Success/failure
 * - Error messages for failed requests
 * 
 * @example
 * ```ts
 * const response = await monitoredFetch('/api/payment-intent', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 *   label: 'create-payment-intent'
 * });
 * ```
 */
export async function monitoredFetch(
  url: string,
  options: MonitoredFetchOptions = {}
): Promise<Response> {
  const { skipTracking = false, label, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const startTime = nowMs();
  const { host, path } = parseUrl(url);
  const sanitizedUrl = getSanitizedPath(url);

  const shouldCapture = async () => {
    if (skipTracking) return false;

    if (typeof window === 'undefined') {
      return getServerPosthogConfig() !== null;
    }

    const posthog = await getPosthog();
    if (!posthog) return false;
    const featureOn = posthog.isFeatureEnabled?.('frontend-event-tracking') ?? false;
    if (!featureOn) return false;
    return true;
  };
  
  // Helper to send tracking event
  const trackRequest = async (
    response: Response | null, 
    networkError: Error | null
  ) => {
    try {
      if (!(await shouldCapture())) {
        return;
      }

      const duration = Math.round(nowMs() - startTime);
      const route = getCurrentRoute();

      if (networkError) {
        const eventData: ApiRequestEvent = {
          url: sanitizedUrl,
          method,
          status: 0,
          duration_ms: duration,
          success: false,
          error_message: networkError.message,
          request_path: path,
          request_host: host,
          route,
        };

        if (label) {
          eventData.label = label;
        }

        if (typeof window === 'undefined') {
          void captureServerEvent('api_request', eventData);
          return;
        }

        const posthog = await getPosthog();
        if (!posthog) return;
        try {
          posthog.capture('api_request', eventData);
        } catch {
          return;
        }

        if (import.meta.env.MODE === 'development') {
          console.log(`[API] ✗ ${method} ${path} - 0 (${duration}ms) ${networkError.message}`);
        }
      } else if (response) {
        const eventData: ApiRequestEvent = {
          url: sanitizedUrl,
          method,
          status: response.status,
          duration_ms: duration,
          success: response.ok,
          request_path: path,
          request_host: host,
          route,
        };

        if (!response.ok) {
          eventData.error_message = response.statusText || `HTTP ${response.status}`;
        }

        if (label) {
          eventData.label = label;
        }

        if (typeof window === 'undefined') {
          void captureServerEvent('api_request', eventData);
          return;
        }

        const posthog = await getPosthog();
        if (!posthog) return;
        try {
          posthog.capture('api_request', eventData);
        } catch {
          return;
        }

        if (import.meta.env.MODE === 'development') {
          const statusIcon = eventData.success ? '✓' : '✗';
          console.log(`[API] ${statusIcon} ${method} ${path} - ${eventData.status} (${duration}ms)`);
        }
      }
    } catch {
      return;
    }
  };
  
  // Execute fetch and track
  try {
    const response = await fetch(url, fetchOptions);
    // Don't block the request path on analytics
    scheduleMicrotask(() => {
      void trackRequest(response, null).catch(() => undefined);
    });
    return response;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    scheduleMicrotask(() => {
      void trackRequest(null, error).catch(() => undefined);
    });
    throw e;
  }
}

/**
 * Convenience method for POST requests
 */
export async function monitoredPost(
  url: string,
  body: unknown,
  options: Omit<MonitoredFetchOptions, 'method' | 'body'> = {}
): Promise<Response> {
  return monitoredFetch(url, {
    ...options,
    method: 'POST',
    headers: {
      ...options.headers,
      'Content-Type': 'application/json', // Always JSON since we stringify body
    },
    body: JSON.stringify(body),
  });
}

/**
 * Convenience method for GET requests
 */
export async function monitoredGet(
  url: string,
  options: Omit<MonitoredFetchOptions, 'method'> = {}
): Promise<Response> {
  return monitoredFetch(url, {
    ...options,
    method: 'GET',
  });
}

export default monitoredFetch;
