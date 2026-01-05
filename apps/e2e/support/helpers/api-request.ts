import { APIRequestContext } from "@playwright/test";

/**
 * Custom error class for API errors with status code exposed as property
 * Sanitizes error messages to prevent leaking sensitive data in logs
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly responseBody: string;

  constructor(status: number, statusText: string, responseBody: string) {
    // Sanitize error message: only include status info, not full response body
    // Full response body is available via responseBody property for debugging if needed
    const sanitizedMessage = `API request failed: ${status} ${statusText}`;
    super(sanitizedMessage);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    // Store full response body for programmatic access, but don't expose in message
    this.responseBody = responseBody;
  }
}

/**
 * Pure function for API requests
 * Framework-agnostic, accepts all dependencies explicitly
 */
type ApiRequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type ApiRequestParams = {
  request: APIRequestContext;
  method: ApiRequestMethod;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  authToken?: string;
};

export async function apiRequest<T = unknown>({
  request,
  method,
  url,
  data,
  headers = {},
  query = {},
  authToken,
}: ApiRequestParams): Promise<T> {
  const baseUrl =
    process.env.API_URL || process.env.BACKEND_URL || "http://localhost:9000";
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
  const requestUrl = new URL(fullUrl);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      requestUrl.searchParams.append(key, String(value));
    }
  });

  // Security: Only attach Authorization header to internal API URLs
  // Prevent token leakage to external URLs
  const isExternalUrl = url.startsWith("http") && !requestUrl.href.startsWith(baseUrl);
  const authorization = !isExternalUrl ? (authToken || process.env.ADMIN_TOKEN) : undefined;

  const response = await request.fetch(requestUrl.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "",
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      ...headers,
    },
    data: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok()) {
    const errorText = await response.text();
    throw new ApiError(response.status(), response.statusText(), errorText);
  }

  return response.json();
}
