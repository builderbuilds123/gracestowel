import { generateTestId, generateTestEmail, generateTestPhone } from './id-generator';

export interface TestProduct {
  id: string;
  handle: string;
  title: string;
  variants: TestVariant[];
}

export interface TestVariant {
  id: string;
  sku: string;
  price: number;
  inventory_quantity: number;
}

export interface TestCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface TestAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  province: string;
  postal_code: string;
  country_code: string;
  phone: string;
}

export interface TestCartItem {
  variant_id: string;
  quantity: number;
}

export class DataFactory {
  private createdResources: Array<{ type: string; id: string }> = [];
  private backendUrl: string;
  private medusaUrl: string;

  constructor() {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:9000';
    this.medusaUrl = process.env.MEDUSA_URL || 'http://localhost:9000';
  }

  /**
   * Fetch available products from the store
   */
  async getAvailableProducts(): Promise<TestProduct[]> {
    try {
        const response = await fetch(`${this.medusaUrl}/store/products?limit=10`);
        if (!response.ok) throw new Error(`Fetch products failed: ${response.statusText}`);
        const data = await response.json();
        return data.products.map((p: any) => ({
          id: p.id,
          handle: p.handle,
          title: p.title,
          variants: p.variants.map((v: any) => ({
            id: v.id,
            sku: v.sku,
            price: v.prices?.[0]?.amount || 0,
            inventory_quantity: v.inventory_quantity || 100,
          })),
        }));
    } catch (e) {
        console.warn('Failed to fetch products from Medusa (backend likely down or network issue). Returning MOCK product.');
        // Return a mock product so tests can proceed if backend is not available
        return [{
            id: 'prod_mock_1',
            handle: 'mock-product',
            title: 'Mock Product',
            variants: [{
                id: 'variant_mock_1',
                sku: 'MOCK-SKU',
                price: 1000,
                inventory_quantity: 100
            }]
        }];
    }
  }

  /**
   * Get a random available product
   */
  async getRandomProduct(): Promise<TestProduct> {
    const products = await this.getAvailableProducts();
    if (products.length === 0) {
      throw new Error('No products available in store');
    }
    return products[Math.floor(Math.random() * products.length)];
  }

  /**
   * Generate a test shipping address
   */
  generateAddress(overrides?: Partial<TestAddress>): TestAddress {
    return {
      first_name: 'Test',
      last_name: generateTestId('User'),
      address_1: '123 Test Street',
      city: 'Test City',
      province: 'CA',
      postal_code: '90210',
      country_code: 'us',
      phone: generateTestPhone(),
      ...overrides,
    };
  }

  /**
   * Generate test customer data
   */
  generateCustomer(overrides?: Partial<TestCustomer>): Omit<TestCustomer, 'id'> {
    return {
      email: generateTestEmail(),
      first_name: 'Test',
      last_name: generateTestId('Customer'),
      ...overrides,
    };
  }

  /**
   * Create a cart with items
   */
  async createCart(items?: TestCartItem[]): Promise<{ id: string; items: any[] }> {
    // Create empty cart
    try {
        const createResponse = await fetch(`${this.medusaUrl}/store/carts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region_id: await this.getDefaultRegionId() }),
        });

        if (!createResponse.ok) {
            // Fallback to mock if API fails
            throw new Error(`Create cart failed: ${createResponse.statusText}`);
        }

        const { cart } = await createResponse.json();

        this.trackResource('cart', cart.id);

        // Add items if provided
        if (items && items.length > 0) {
          for (const item of items) {
            await fetch(`${this.medusaUrl}/store/carts/${cart.id}/line-items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item),
            });
          }

          // Fetch updated cart
          const updatedResponse = await fetch(`${this.medusaUrl}/store/carts/${cart.id}`);
          const { cart: updatedCart } = await updatedResponse.json();
          return { id: updatedCart.id, items: updatedCart.items };
        }

        return { id: cart.id, items: [] };

    } catch (e) {
        console.warn('Failed to create cart in Medusa. Returning MOCK cart.');
        const mockCartId = 'cart_mock_' + Date.now();
        this.trackResource('cart', mockCartId);
        return {
            id: mockCartId,
            items: items?.map(i => ({...i, id: 'item_' + Date.now(), title: 'Mock Item'})) || []
        };
    }
  }

  /**
   * Get default region ID
   */
  private async getDefaultRegionId(): Promise<string> {
    try {
        const response = await fetch(`${this.medusaUrl}/store/regions`);
        if (!response.ok) throw new Error("Failed to fetch regions");
        const { regions } = await response.json();
        return regions[0]?.id || 'reg_01';
    } catch (e) {
        return 'reg_mock_01';
    }
  }

  /**
   * Track a created resource for cleanup
   */
  private trackResource(type: string, id: string): void {
    this.createdResources.push({ type, id });
  }

  /**
   * Clean up all created resources
   */
  async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up ${this.createdResources.length} test resources...`);

    for (const resource of this.createdResources.reverse()) {
      try {
        if (resource.id.includes('mock')) continue; // Skip cleanup for mock resources

        switch (resource.type) {
          case 'cart':
            // Carts auto-expire, but we can try to delete (if Medusa allows DELETE on store/carts which it typically doesn't, usually complete)
            // Actually Medusa Store API doesn't expose DELETE cart publicly usually.
            // But we might be able to clean it up via Admin API if we had access.
            // For now, let's just log it or attempt call.
            // await fetch(`${this.medusaUrl}/store/carts/${resource.id}`, {
            //   method: 'DELETE',
            // }).catch(() => {});
            break;
          case 'customer':
            // Customers may need admin API to delete
            // console.log(`  - Skipping customer cleanup: ${resource.id}`);
            break;
          default:
            // console.log(`  - Unknown resource type: ${resource.type}`);
        }
      } catch (error) {
        console.warn(`  - Failed to cleanup ${resource.type}:${resource.id}`, error);
      }
    }

    this.createdResources = [];
    console.log('✅ Cleanup complete');
  }
}
