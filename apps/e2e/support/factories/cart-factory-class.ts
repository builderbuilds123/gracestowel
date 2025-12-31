import { APIRequestContext } from '@playwright/test';
import { Cart, createCart } from './cart-factory';
import { apiRequest } from '../helpers/api-request';

export class CartFactory {
  private createdCartIds: string[] = [];

  constructor(private request: APIRequestContext) {}

  async createCart(overrides: Partial<Cart> = {}): Promise<Cart> {
    const cart = createCart(overrides);
    try {
      // In Medusa v2, you typically create a cart via store API
      const response = await apiRequest<{ cart: Cart }>({
        request: this.request,
        method: 'POST',
        url: '/store/carts',
        data: {
          items: cart.items.map(i => ({
             variant_id: i.variant_id,
             quantity: i.quantity
          })),
          region_id: cart.region_id
        },
      });

      if (response.cart?.id) {
        this.createdCartIds.push(response.cart.id);
        return response.cart;
      }
    } catch (e) {
      console.warn('Failed to seed cart, using local mock', e);
    }
    return cart;
  }

  async cleanup(): Promise<void> {
    // Carts are transient, but good to clean if admin APIs allow or just rely on expiry.
    // Assuming no specific delete cart endpoint exposed easily without admin or complex auth,
    // we might just leave them or use admin API if available.
    // For now, no-op or implementation if API supports it.
  }
}
