import { APIRequestContext } from '@playwright/test';
import { User, createUser } from '../factories/user-factory';
import { Product, createProduct } from '../factories/product-factory';
import { apiRequest } from './api-request';

/**
 * Seed helpers for API-first test setup
 * Always use API calls for data setup - 10-50x faster than UI
 */

export async function seedUser(
  request: APIRequestContext,
  overrides: Partial<User> = {},
): Promise<User> {
  const user = createUser(overrides);

  try {
    // Attempt to create user via API
    // Adjust endpoint based on your Medusa API structure
    await apiRequest({
      request,
      method: 'POST',
      url: '/admin/customers',
      data: user,
    });
  } catch (error) {
    // If endpoint doesn't exist or requires auth, log and continue
    // Tests can still use the factory data for UI interactions
    console.warn('Could not seed user via API:', error);
  }

  return user;
}

export async function seedProduct(
  request: APIRequestContext,
  overrides: Partial<Product> = {},
): Promise<Product> {
  const product = createProduct(overrides);

  try {
    // Attempt to create product via API
    // Adjust endpoint based on your Medusa API structure
    await apiRequest({
      request,
      method: 'POST',
      url: '/admin/products',
      data: product,
    });
  } catch (error) {
    console.warn('Could not seed product via API:', error);
  }

  return product;
}
