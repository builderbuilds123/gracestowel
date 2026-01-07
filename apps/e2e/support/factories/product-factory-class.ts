import { APIRequestContext } from '@playwright/test';
import { Product } from './product-factory';
import { apiRequest } from '../helpers/api-request';

/**
 * ProductFactory - fetches existing seeded products for testing
 * 
 * This factory ONLY fetches existing seeded products (like "The Nuzzle")
 * to avoid V2 API format issues when creating products.
 */
export class ProductFactory {
  constructor(private request: APIRequestContext) {}

  /**
   * Get an existing seeded product for testing.
   * 
   * This fetches published products from the store API (not admin)
   * to ensure we get products that are available for purchase.
   */
  async createProduct(overrides: Partial<Product> = {}): Promise<Product> {
    // STRATEGY: Fetch from store API (published products only)
    // This avoids issues with admin API and ensures products are purchasable
    try {
      const storeProducts = await apiRequest<{ products: any[] }>({
        request: this.request,
        method: 'GET',
        url: '/store/products?limit=10',
      });

      if (storeProducts.products?.length > 0) {
        // Prefer "The Nuzzle" product since tests reference it
        const nuzzle = storeProducts.products.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || storeProducts.products[0];
        
        console.log(`Using seeded product: ${product.title} (${product.id})`);
        
        // Get the first variant with all its details
        const variant = product.variants?.[0];
        if (!variant) {
          console.warn('Product has no variants, looking for another product...');
        }
        
        return {
          id: product.id,
          title: product.title,
          description: product.description,
          handle: product.handle,
          status: 'published',
          variants: product.variants,
          variant_id: variant?.id,
        };
      }
    } catch (error) {
      console.warn('Could not fetch from store API:', error);
    }

    // FALLBACK: Try admin API for published products
    try {
      const adminProducts = await apiRequest<{ products: any[] }>({
        request: this.request,
        method: 'GET',
        url: '/admin/products?status=published&limit=10',
      });

      if (adminProducts.products?.length > 0) {
        const product = adminProducts.products[0];
        console.log(`Using admin product: ${product.title} (${product.id})`);
        
        const variant = product.variants?.[0];
        return {
          id: product.id,
          title: product.title,
          description: product.description,
          handle: product.handle,
          status: 'published',
          variants: product.variants,
          variant_id: variant?.id,
        };
      }
    } catch (error) {
      console.warn('Could not fetch from admin API:', error);
    }

    // If we can't find existing products, throw error instead of creating invalid ones
    throw new Error(
      'No seeded products found. Please run the seed script first: pnpm --filter backend seed'
    );
  }

  async cleanup(): Promise<void> {
    // No cleanup needed - we don't create products
  }
}
