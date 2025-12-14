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
  
  let response: Response;
  let error: Error | null = null;
  
  try {
    response = await fetch(url, fetchOptions);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    throw e;
  } finally {
    const duration = Math.round(performance.now() - startTime);
    
    // Only track if PostHog is available and tracking is not skipped
    if (!skipTracking && typeof window !== 'undefined' && posthog) {
      const { host, path } = parseUrl(url);
      const sanitizedUrl = getSanitizedPath(url);
      
      const eventData: ApiRequestEvent = {
        url: sanitizedUrl,
        method,
        status: error ? 0 : response!.status,
        duration_ms: duration,
        success: !error && response!.ok,
        request_path: path,
        request_host: host,
      };
      
      // Add error message for failed requests
      if (error) {
        eventData.error_message = error.message;
      } else if (!response!.ok) {
        // Try to get error message from response for non-ok status
        try {
          const clonedResponse = response!.clone();
          const body = await clonedResponse.json() as { error?: string; message?: string };
          if (body.error || body.message) {
            eventData.error_message = body.error || body.message;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      
      // Add label if provided
      if (label) {
        (eventData as any).label = label;
      }
      
      posthog.capture('api_request', eventData);
      
      // Log in development
      if (import.meta.env.MODE === 'development') {
        const statusIcon = eventData.success ? '✓' : '✗';
        console.log(
          `[API] ${statusIcon} ${method} ${path} - ${eventData.status} (${duration}ms)`
        );
      }
    }
  }
  
  return response!;
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
      'Content-Type': 'application/json',
      ...options.headers,
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
