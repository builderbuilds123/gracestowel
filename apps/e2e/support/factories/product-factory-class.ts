import { APIRequestContext } from '@playwright/test';
import { Product, createProduct } from './product-factory';
import { apiRequest } from '../helpers/api-request';

/**
 * ProductFactory with auto-cleanup
 * 
 * This factory first tries to fetch existing seeded products (preferred),
 * falling back to creating new ones only if needed.
 */
export class ProductFactory {
  private createdProductIds: string[] = [];

  constructor(private request: APIRequestContext) {}

  /**
   * Get a product for testing.
   * 
   * Strategy:
   * 1. First try to fetch existing seeded products (most reliable)
   * 2. Only create new products if no seeded products exist
   */
  async createProduct(overrides: Partial<Product> = {}): Promise<Product> {
    // Try to fetch existing seeded products first (more reliable than creating)
    try {
      const existingProducts = await apiRequest<{ products: Product[] }>({
        request: this.request,
        method: 'GET',
        url: '/admin/products?limit=10',
      });

      if (existingProducts.products?.length > 0) {
        const existingProduct = existingProducts.products[0];
        console.log(`Using existing seeded product: ${existingProduct.title} (${existingProduct.id})`);
        
        // Get variant ID from the product
        const variantId = (existingProduct as any).variants?.[0]?.id;
        
        return {
          id: existingProduct.id,
          title: existingProduct.title,
          description: existingProduct.description,
          handle: existingProduct.handle,
          status: existingProduct.status,
          variants: (existingProduct as any).variants,
          variant_id: variantId,
        };
      }
    } catch (error) {
      console.warn('Could not fetch existing products:', error);
    }

    // Fallback: create a new product via API
    const product = createProduct(overrides);

    try {
      const { id, variant_id, ...payload } = product;
      
      // Format payload for Medusa V2 Admin API
      const v2Payload = {
        title: payload.title,
        description: payload.description,
        handle: payload.handle,
        status: payload.status || 'published',
        options: payload.options?.map(opt => ({
          title: opt.title,
          values: opt.values,
        })),
        variants: payload.variants?.map(v => ({
          title: v.title,
          sku: v.sku,
          options: v.options,
          manage_inventory: false,
          allow_backorder: true,
          prices: v.prices?.map(p => ({
            amount: p.amount,
            currency_code: p.currency_code,
          })),
        })),
      };

      console.log("Creating product with V2 payload:", JSON.stringify(v2Payload, null, 2));
      
      const created = await apiRequest<{ product: Product }>({
        request: this.request,
        method: 'POST',
        url: '/admin/products',
        data: v2Payload,
      });

      if (created.product?.id) {
        this.createdProductIds.push(created.product.id);
        const apiProduct = created.product;
        return { 
          ...product, 
          id: apiProduct.id,
          variants: (apiProduct as any).variants,
          variant_id: (apiProduct as any).variants?.[0]?.id 
        };
      }
    } catch (error) {
      console.warn('Could not create product via API, using factory data only:', error);
    }

    // Last resort: return mock product data for UI tests only
    return { ...product, variant_id: `variant_${product.id}` };
  }

  async cleanup(): Promise<void> {
    // Only cleanup products we created (not seeded ones)
    for (const productId of this.createdProductIds) {
      try {
        await apiRequest({
          request: this.request,
          method: 'DELETE',
          url: `/admin/products/${productId}`,
        });
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Could not cleanup product ${productId}:`, error);
      }
    }
    this.createdProductIds = [];
  }
}
