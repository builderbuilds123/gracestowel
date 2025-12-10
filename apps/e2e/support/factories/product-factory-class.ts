import { APIRequestContext } from '@playwright/test';
import { Product, createProduct } from './product-factory';
import { apiRequest } from '../helpers/api-request';

/**
 * ProductFactory with auto-cleanup
 * Tracks created products and deletes them after test
 */
export class ProductFactory {
  private createdProductIds: string[] = [];

  constructor(private request: APIRequestContext) {}

  async createProduct(overrides: Partial<Product> = {}): Promise<Product> {
    const product = createProduct(overrides);

    try {
      // Attempt to create via API
      const created = await apiRequest<{ product: { id: string } }>({
        request: this.request,
        method: 'POST',
        url: '/admin/products',
        data: product,
      });

      if (created.product?.id) {
        this.createdProductIds.push(created.product.id);
      }
    } catch (error) {
      // If API seeding fails, still return product data for UI tests
      console.warn('Could not seed product via API, using factory data only:', error);
    }

    return product;
  }

  async cleanup(): Promise<void> {
    // Cleanup all created products
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
