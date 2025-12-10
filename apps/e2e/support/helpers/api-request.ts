import { APIRequestContext } from '@playwright/test';

/**
 * Pure function for API requests
 * Framework-agnostic, accepts all dependencies explicitly
 */
type ApiRequestParams = {
  request: APIRequestContext;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
};

export async function apiRequest<T = unknown>({
  request,
  method,
  url,
  data,
  headers = {},
}: ApiRequestParams): Promise<T> {
  const baseUrl = process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:9000';
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const response = await request.fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    data: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status()} ${errorText}`);
  }

  return response.json();
}
