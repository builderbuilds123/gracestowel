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
    // STRATEGY: Try admin API for published products (this gives us more info like sales channels)
    try {
      const adminProducts = await apiRequest<{ products: any[] }>({
        request: this.request,
        method: 'GET',
        url: '/admin/products?status[]=published&limit=20&fields=+variants,+sales_channels',
      });

      if (adminProducts.products?.length > 0) {
        // Log all available handles for debugging
        console.log(`Available admin products handles: ${adminProducts.products.map(p => p.handle).join(', ')}`);

        // Prefer "The Nuzzle" product
        const nuzzle = adminProducts.products.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || adminProducts.products[0];
        
        console.log(`Using admin product: ${product.title} (${product.id})`);
        
        const variant = product.variants?.find((v: any) => v.inventory_quantity !== 0) || product.variants?.[0];
        const scId = product.sales_channels?.[0]?.id;

        if (scId) {
          console.log(`Product ${product.handle} is linked to sales channel: ${scId}`);
        } else {
          console.warn(`Product ${product.handle} has NO sales channels linked!`);
        }

        return {
          id: product.id,
          title: product.title,
          description: product.description,
          handle: product.handle,
          status: 'published',
          variants: product.variants,
          variant_id: variant?.id,
          sales_channel_id: scId,
        };
      }
    } catch (error) {
      console.warn('Could not fetch from admin API:', error);
    }

    // FALLBACK: Fetch from store API (published products only)
    try {
      const storeProducts = await apiRequest<{ products: any[] }>({
        request: this.request,
        method: 'GET',
        url: '/store/products?limit=20',
        headers: {
          'x-publishable-api-key': process.env.MEDUSA_PUBLISHABLE_KEY || '',
        },
      });

      if (storeProducts.products?.length > 0) {
        // Log all available handles for debugging
        console.log(`Available products handles: ${storeProducts.products.map(p => p.handle).join(', ')}`);

        // Prefer "The Nuzzle" product since tests reference it
        const nuzzle = storeProducts.products.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || storeProducts.products[0];
        
        console.log(`Using seeded product: ${product.title} (${product.id}, handle: ${product.handle})`);
        
        // Get the first variant with all its details
        const variant = product.variants?.find((v: any) => v.inventory_quantity !== 0) || product.variants?.[0];
        if (!variant) {
          console.warn(`Product ${product.id} has no variants!`);
        } else {
          console.log(`Using variant: ${variant.title} (${variant.id})`);
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

    throw new Error(
      'No seeded published products found. Please ensure the backend is seeded and products are published.'
    );
  }

  async cleanup(): Promise<void> {
    // No cleanup needed - we don't create products
  }
}
