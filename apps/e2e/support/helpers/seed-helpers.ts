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

/**
 * Ensures "The Nuzzle" product exists, is published, and linked to the correct sales channel.
 * This is a "Self-Healing" helper for CI stability.
 */
export async function ensureTheNuzzleExists(request: APIRequestContext): Promise<string> {
  const handle = 'the-nuzzle';
  
  // 1. Get the Sales Channel ID associated with the current Publishable Key
  // This is critical because the Storefront uses this PK to query products.
  let salesChannelId: string | undefined;
  try {
    const pk = process.env.MEDUSA_PUBLISHABLE_KEY;
    if (pk) {
      // Find the PK object to get its sales channels
      const { api_keys } = await apiRequest<{ api_keys: any[] }>({
        request, method: 'GET', url: '/admin/api-keys?limit=100'
      });
      const currentPk = api_keys.find(k => k.token === pk);
      
      if (currentPk) {
        // Fetch sales channels for this PK if not already present
        const { sales_channels } = await apiRequest<{ sales_channels: any[] }>({
          request, method: 'GET', url: `/admin/api-keys/${currentPk.id}/sales-channels`
        });
        if (sales_channels.length > 0) {
          salesChannelId = sales_channels[0].id;
          console.log(`[Self-Heal] Found Sales Channel ID for PK: ${salesChannelId}`);
        }
      }
    }
  } catch (err) {
    console.warn('[Self-Heal] Failed to resolve Sales Channel from PK, falling back to default or existing links.', err);
  }

  // 2. Check if product exists
  let existingProduct: any;
  try {
    const { products } = await apiRequest<{ products: any[] }>({
      request, method: 'GET', url: `/admin/products?handle=${handle}&limit=1&fields=+sales_channels`
    });
    existingProduct = products[0];
  } catch (err) {
    console.log('[Self-Heal] Product check failed, assuming missing.');
  }

  // 3. Create or Update
  if (!existingProduct) {
    console.log('[Self-Heal] "The Nuzzle" is looking missing. Creating it...');
    try {
      const payload: any = {
        title: "The Nuzzle",
        handle: handle,
        description: "Self-healed product for E2E tests",
        status: "published",
        images: [{ url: "https://gracestowel.com/washcloth-nuzzle.jpg" }], // Use valid URL structure
        options: [{ title: "Color", values: ["Cloud White"] }],
        variants: [
          {
            title: "Cloud White",
            sku: "NUZZLE-HEALED",
            inventory_quantity: 100,
            manage_inventory: true,
            prices: [
              { amount: 1800, currency_code: "usd" },
              { amount: 2400, currency_code: "cad" }
            ],
            options: { "Color": "Cloud White" }
          }
        ]
      };

      if (salesChannelId) {
        payload.sales_channels = [{ id: salesChannelId }];
      }

      const { product } = await apiRequest<{ product: any }>({
        request, method: 'POST', url: '/admin/products', data: payload
      });
      console.log(`[Self-Heal] Created "The Nuzzle" (${product.id})`);
      return product.id;
    } catch (err) {
      console.error('[Self-Heal] Failed to create "The Nuzzle":', err);
      throw err;
    }
  } else {
    // Product exists, ensure it is linked to the Sales Channel
    console.log(`[Self-Heal] "The Nuzzle" exists (${existingProduct.id}). Verifying Sales Channel link...`);
    
    if (salesChannelId) {
      const isLinked = existingProduct.sales_channels?.some((sc: any) => sc.id === salesChannelId);
      if (!isLinked) {
        console.log(`[Self-Heal] Linking product to Sales Channel ${salesChannelId}...`);
        await apiRequest({
          request, 
          method: 'POST', 
          url: `/admin/products/${existingProduct.id}/sales-channels`,
          data: { add: [salesChannelId] }
        });
      }
    }
    
    // Ensure it is published
    if (existingProduct.status !== 'published') {
         await apiRequest({
          request, 
          method: 'POST', 
          url: `/admin/products/${existingProduct.id}`,
          data: { status: 'published' }
        });
    }

    return existingProduct.id;
  }
}
