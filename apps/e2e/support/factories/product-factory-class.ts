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
        // Filter out products that have no variants or no sales channels (Medusa V2 requirement for storefront)
        const validProducts = adminProducts.products.filter(p => 
          (p.variants?.length > 0) && (p.sales_channels?.length > 0)
        );

        if (validProducts.length === 0) {
          console.warn('No products found with both variants AND sales channels among admin products!');
        }

        // Prefer "The Nuzzle" product if it's among valid ones
        const nuzzle = validProducts.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || validProducts[0] || adminProducts.products[0];
        
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
        console.log(`Available store products handles: ${storeProducts.products.map(p => p.handle).join(', ')}`);

        // Prefer "The Nuzzle" product
        const nuzzle = storeProducts.products.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || storeProducts.products[0];
        
        console.log(`Using store product: ${product.title} (${product.id}, handle: ${product.handle})`);
        
        const variant = product.variants?.find((v: any) => v.inventory_quantity !== 0) || product.variants?.[0];
        
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
    // No cleanup needed
  }
}
