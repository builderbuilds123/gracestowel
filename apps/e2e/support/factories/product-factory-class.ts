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
    // 1. Identify which sales channels are linked to our current publishable key
    let linkedSalesChannelIds: string[] = [];
    const pk = process.env.MEDUSA_PUBLISHABLE_KEY;
    
    if (pk) {
      try {
        const adminApiKeys = await apiRequest<{ api_keys: any[] }>({
          request: this.request,
          method: 'GET',
          url: '/admin/api-keys?limit=20',
        });
        
        const currentPk = adminApiKeys.api_keys.find(k => k.token === pk);
        if (currentPk && currentPk.sales_channels) {
          linkedSalesChannelIds = currentPk.sales_channels.map((sc: any) => sc.id);
          console.log(`Current publishable key is linked to sales channels: ${linkedSalesChannelIds.join(', ')}`);
        } else if (currentPk) {
          // In some V2 versions, we might need a separate call to /admin/api-keys/:id/sales-channels
          const scLinks = await apiRequest<{ sales_channels: any[] }>({
            request: this.request,
            method: 'GET',
            url: `/admin/api-keys/${currentPk.id}/sales-channels`,
          });
          linkedSalesChannelIds = scLinks.sales_channels.map((sc: any) => sc.id);
          console.log(`Fetched linked sales channels: ${linkedSalesChannelIds.join(', ')}`);
        }
      } catch (error) {
        console.warn('Could not identify linked sales channels for publishable key:', error);
      }
    }

    // 2. STRATEGY: Try admin API for published products
    try {
      const adminProducts = await apiRequest<{ products: any[] }>({
        request: this.request,
        method: 'GET',
        url: '/admin/products?status[]=published&limit=20&fields=+variants,+sales_channels',
      });

      if (adminProducts.products?.length > 0) {
        // Filter products that have variants AND are linked to a sales channel
        let validProducts = adminProducts.products.filter(p => 
          (p.variants?.length > 0) && (p.sales_channels?.length > 0)
        );

        // EXTRA CREDIT: Filter products that are linked to one of OUR publishable key's sales channels
        if (linkedSalesChannelIds.length > 0) {
          const compatibleProducts = validProducts.filter(p => 
            p.sales_channels.some((sc: any) => linkedSalesChannelIds.includes(sc.id))
          );
          if (compatibleProducts.length > 0) {
            console.log(`Found ${compatibleProducts.length} products compatible with the current publishable key`);
            validProducts = compatibleProducts;
          } else {
            console.warn('No products found that match the current publishable key\'s sales channels!');
          }
        }

        const nuzzle = validProducts.find(p => 
          p.handle === 'the-nuzzle' || p.title?.includes('Nuzzle')
        );
        const product = nuzzle || validProducts[0] || adminProducts.products[0];
        
        console.log(`Using admin product: ${product.title} (${product.id})`);
        
        const variant = product.variants?.find((v: any) => v.inventory_quantity !== 0) || product.variants?.[0];
        
        // Pick a sales channel that is both on the product AND linked to the PK
        let scId = product.sales_channels?.[0]?.id;
        if (linkedSalesChannelIds.length > 0) {
          const compatibleSc = product.sales_channels.find((sc: any) => linkedSalesChannelIds.includes(sc.id));
          if (compatibleSc) scId = compatibleSc.id;
        }

        if (scId) {
          console.log(`Product ${product.handle} is linked to sales channel: ${scId}`);
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
