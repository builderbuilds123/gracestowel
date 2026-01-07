import { APIRequestContext } from '@playwright/test';

/**
 * Pure function for API requests
 * Framework-agnostic, accepts all dependencies explicitly
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

type ApiRequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type ApiRequestParams = {
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

  // Determine which token to use for authorization
  // Admin API: process.env.ADMIN_TOKEN (default) or authToken
  // Store API: authToken only (e.g. customer JWT) - do NOT use ADMIN_TOKEN
  const isAdminUrl = requestUrl.pathname.startsWith("/admin");
  const isStoreUrl = requestUrl.pathname.startsWith("/store");
  
  let finalAuthToken = authToken;
  if (isAdminUrl && !finalAuthToken) {
    finalAuthToken = process.env.ADMIN_TOKEN;
  }
  
  // Security fallback: Use publishable key as last resort for store URLs if no token provided
  // (Medusa V2 Store API accepts this in the header, sometimes as Bearer for consistency)
  if (isStoreUrl && !finalAuthToken && !headers["x-publishable-api-key"]) {
    // This is less common but safe
  }

  const response = await request.fetch(requestUrl.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "",
      ...(finalAuthToken ? { Authorization: `Bearer ${finalAuthToken}` } : {}),
      ...headers,
    },
    data,
  });

  if (!response.ok()) {
    const errorText = await response.text();
    console.error(`API Error ${response.status()} at ${url}:`, errorText);
    throw new ApiError(response.status(), response.statusText(), errorText);
  }

  return response.json();
}
