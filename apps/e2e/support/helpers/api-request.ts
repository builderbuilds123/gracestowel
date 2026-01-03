import { APIRequestContext } from "@playwright/test";

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
    throw new Error(
      `API request failed: ${response.status()} ${response.statusText()} :: ${errorText.slice(0, 200)}`,
    );
  }

  return response.json();
}
