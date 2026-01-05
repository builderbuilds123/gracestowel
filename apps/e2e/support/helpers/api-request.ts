import { APIRequestContext } from "@playwright/test";

/**
 * Custom error class for API errors with status code exposed as property
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly responseBody: string;

  constructor(status: number, statusText: string, responseBody: string) {
    super(`API request failed: ${status} ${statusText} :: ${responseBody.slice(0, 200)}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
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

  const authorization = authToken || process.env.ADMIN_TOKEN;

  const response = await request.fetch(requestUrl.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
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
