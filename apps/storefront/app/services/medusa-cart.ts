import { getMedusaClient } from "../lib/medusa";
import type { CartItem } from "../types/product";
import { retry } from "../utils/retry";

// Medusa Cart Types (v2 API structure)
export interface Cart {
  id: string;
  region_id?: string;
  email: string | null;
  billing_address: object | null;
  shipping_address: object | null;
  items: LineItem[];
  shipping_methods?: object[];
  total?: number;
  subtotal?: number;
  discount_total?: number;
  shipping_total?: number;
  tax_total?: number;
  region?: object;
}

export interface LineItem {
  id: string;
  title: string;
  subtitle?: string | null;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  variant_id: string;
  variant?: {
    id: string;
    title: string;
    sku: string | null;
    options?: any[];
  };
}

export interface ShippingAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  country_code: string;
  province?: string;
  postal_code: string;
  phone?: string;
  company?: string;
}

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
  price_type?: string;
  provider_id?: string;
  is_return?: boolean;
  originalAmount?: number; // Custom field for promotions
}

export class MedusaCartService {
  private client: any;

  constructor(context?: { cloudflare?: { env?: any } }) {
    this.client = getMedusaClient(context);
  }

  /**
   * Create a new cart or retrieve an existing one if valid
   * Uses Medusa v2 SDK: client.store.cart.create()
   */
  async getOrCreateCart(regionId: string, currencyCode: string): Promise<string> {
    return retry(async () => {
      try {
        const { cart } = await this.client.store.cart.create({
          region_id: regionId,
        });
        return cart.id;
      } catch (error) {
        console.error("Error creating Medusa cart:", error);
        throw error;
      }
    });
  }

  /**
   * Retrieve a cart by ID
   * Uses Medusa v2 SDK: client.store.cart.retrieve()
   */
  async getCart(cartId: string): Promise<Cart | null> {
    return retry(async () => {
      try {
        const { cart } = await this.client.store.cart.retrieve(cartId);
        return cart;
      } catch (error: any) {
        // Check for 404 in various error formats
        if (error.status === 404 || error.response?.status === 404) {
          return null; // Don't retry on 404
        }
        throw error;
      }
    });
  }

  /**
   * Sync local cart items to the Medusa cart
   * Optimizes API calls using Promise.all where possible
   * Uses Medusa v2 SDK methods
   */
  async syncCartItems(cartId: string, localItems: CartItem[]): Promise<Cart> {
    const currentCart = await this.getCart(cartId);
    if (!currentCart) {
      throw new Error(`Cart not found: ${cartId}`);
    }

    const remoteItems = currentCart.items || [];
    const promises: Promise<any>[] = [];

    // 1. Handle updates and additions
    for (const localItem of localItems) {
      if (!localItem.variantId) {
        console.warn(`Skipping item without variantId: ${localItem.title}`);
        continue;
      }

      const remoteItem = remoteItems.find(
        (ri) => ri.variant_id === localItem.variantId || ri.variant?.id === localItem.variantId
      );

      if (remoteItem) {
        // Update quantity if different
        if (remoteItem.quantity !== localItem.quantity) {
          promises.push(
            this.client.store.cart.updateLineItem(cartId, remoteItem.id, {
              quantity: localItem.quantity,
            }).catch((e: any) => {
               console.error(`Failed to update item ${localItem.variantId}:`, e);
            })
          );
        }
      } else {
        // Add new item
        promises.push(
          this.client.store.cart.createLineItem(cartId, {
            variant_id: localItem.variantId,
            quantity: localItem.quantity,
            metadata: localItem.embroidery ? { embroidery: localItem.embroidery } : undefined
          }).catch((e: any) => {
             console.error(`Failed to add item ${localItem.variantId}:`, e);
             if (e.message?.includes('variant')) {
                 console.warn(`Variant not found, skipping: ${localItem.variantId}`);
             }
          })
        );
      }
    }

    // 2. Handle removals
    for (const remoteItem of remoteItems) {
      const variantId = remoteItem.variant_id || remoteItem.variant?.id;
      const localItem = localItems.find((li) => li.variantId === variantId);

      if (!localItem) {
        promises.push(
          this.client.store.cart.deleteLineItem(cartId, remoteItem.id)
            .catch((e: any) => {
               console.error(`Failed to delete item ${remoteItem.id}:`, e);
            })
        );
      }
    }

    // Execute all updates in parallel
    await Promise.all(promises);

    // Return updated cart
    const updatedCart = await this.getCart(cartId);
    return updatedCart!;
  }

  /**
   * Update shipping address on the cart
   * Uses Medusa v2 SDK: client.store.cart.update()
   */
  async updateShippingAddress(cartId: string, address: ShippingAddress): Promise<Cart> {
    return retry(async () => {
        try {
        const { cart } = await this.client.store.cart.update(cartId, {
            shipping_address: address,
        });
        return cart;
        } catch (error) {
        console.error("Error updating shipping address:", error);
        throw error;
        }
    });
  }

  /**
   * Get shipping options for the cart
   * Uses Medusa v2 SDK: client.store.fulfillment.listCartOptions()
   */
  async getShippingOptions(cartId: string): Promise<ShippingOption[]> {
    return retry(async () => {
        try {
        const { shipping_options } = await this.client.store.fulfillment.listCartOptions({
            cart_id: cartId,
        });

        return (shipping_options || []).map((opt: any) => ({
            id: opt.id,
            name: opt.name,
            amount: opt.amount || 0,
            price_type: opt.price_type,
            provider_id: opt.provider_id,
            is_return: opt.is_return,
            originalAmount: undefined
        }));
        } catch (error) {
        console.error("Error fetching shipping options:", error);
        throw error;
        }
    });
  }
}
