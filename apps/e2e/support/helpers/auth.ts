import { APIRequestContext } from '@playwright/test';
import { apiRequest } from './api-request';

/**
 * Helper to authenticate as Admin
 * Returns headers for authenticated requests
 */
export async function getAdminHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  // If we have a token in env, use it
  if (process.env.ADMIN_API_TOKEN) {
    return {
      'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`,
      'x-medusa-access-token': process.env.ADMIN_API_TOKEN
    };
  }

  // Otherwise, attempt login (this is a simplified example)
  // In a real scenario, you might cache this token
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@medusa-test.com';
    const password = process.env.ADMIN_PASSWORD || 'supersecret';

    const response = await apiRequest<{ access_token: string }>({
      request,
      method: 'POST',
      url: '/admin/auth/token',
      data: { email, password }
    });

    if (response.access_token) {
        return {
            'Authorization': `Bearer ${response.access_token}`,
             'x-medusa-access-token': response.access_token
        };
    }
  } catch (e) {
    console.warn('Failed to authenticate as admin automatically', e);
  }

  return {};
}
