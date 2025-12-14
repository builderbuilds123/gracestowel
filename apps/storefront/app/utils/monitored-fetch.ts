/**
 * Monitored Fetch Utility (Story 4.3)
 * Wraps fetch calls to track API latency and errors in PostHog
 */

import posthog from 'posthog-js';

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
    const urlObj = new URL(url, window.location.origin);
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'auth', 'key', 'secret', 'password', 'jwt', 'session'];
    sensitiveParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.pathname + (urlObj.search || '');
  } catch {
    // If URL parsing fails, return as-is but strip obvious tokens
    return url.replace(/[?&](token|auth|key|secret|password|jwt|session)=[^&]*/gi, '');
  }
}

/**
 * Parse URL to extract host and path
 */
function parseUrl(url: string): { host: string; path: string } {
  try {
    const urlObj = new URL(url, window.location.origin);
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
  const startTime = performance.now();
  const { host, path } = parseUrl(url);
  const sanitizedUrl = getSanitizedPath(url);
  
  // Helper to send tracking event
  const trackRequest = async (
    response: Response | null, 
    networkError: Error | null
  ) => {
    if (skipTracking || typeof window === 'undefined' || !posthog) {
      return;
    }
    
    const duration = Math.round(performance.now() - startTime);
    
    // Build event data based on whether we have a network error or HTTP response
    if (networkError) {
      // Network error case - fetch itself threw
      const eventData: ApiRequestEvent = {
        url: sanitizedUrl,
        method,
        status: 0,
        duration_ms: duration,
        success: false,
        error_message: networkError.message,
        request_path: path,
        request_host: host,
      };
      
      if (label) {
        eventData.label = label;
      }
      
      posthog.capture('api_request', eventData);
      
      if (import.meta.env.MODE === 'development') {
        console.log(`[API] ✗ ${method} ${path} - 0 (${duration}ms) ${networkError.message}`);
      }
    } else if (response) {
      // HTTP response case - fetch succeeded, check status
      const eventData: ApiRequestEvent = {
        url: sanitizedUrl,
        method,
        status: response.status,
        duration_ms: duration,
        success: response.ok,
        request_path: path,
        request_host: host,
      };
      
      // Try to extract error message for non-ok responses
      if (!response.ok) {
        try {
          const clonedResponse = response.clone();
          const body = await clonedResponse.json() as { error?: string; message?: string };
          if (body.error || body.message) {
            eventData.error_message = body.error || body.message;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      
      if (label) {
        eventData.label = label;
      }
      
      posthog.capture('api_request', eventData);
      
      if (import.meta.env.MODE === 'development') {
        const statusIcon = eventData.success ? '✓' : '✗';
        console.log(`[API] ${statusIcon} ${method} ${path} - ${eventData.status} (${duration}ms)`);
      }
    }
  };
  
  // Execute fetch and track
  try {
    const response = await fetch(url, fetchOptions);
    await trackRequest(response, null);
    return response;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    await trackRequest(null, error);
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
