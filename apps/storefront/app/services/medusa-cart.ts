import { getMedusaClient } from "../lib/medusa";
import type { CartItem } from "../types/product";
import { retry } from "../utils/retry";
import { createLogger } from "../lib/logger";

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
}

export class MedusaCartService {
  private client: any;
  private logger = createLogger({ context: "MedusaCartService" });

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
   *
   * SHP-01 Review Fix: Returns null on 404 to enable graceful cart expiry handling
   */
  async getCart(cartId: string): Promise<Cart | null> {
    return retry(async () => {
      try {
        const { cart } = await this.client.store.cart.retrieve(cartId, {
          fields: '+promotions,+items.adjustments,+shipping_methods.adjustments'
        });
        return cart;
      } catch (error: any) {
        // Check for 404 in various error formats (cart expired or doesn't exist)
        if (error.status === 404 || error.response?.status === 404) {
          this.logger.warn(`[Cart] Cart ${cartId} not found (possibly expired)`);
          return null; // Don't retry on 404 - allows caller to create new cart
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
               this.logger.error(`Failed to update item ${localItem.variantId}`, e);
               // Re-throw to ensure caller knows update failed
               throw e;
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
             this.logger.error(`Failed to add item ${localItem.variantId}`, e);
             // Re-throw so API returns error (e.g. inventory missing)
             throw e;
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
               this.logger.error(`Failed to delete item ${remoteItem.id}`, e);
            })
        );
      }
    }

    // Execute all updates in parallel for better performance
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
        const normalizedAddress: ShippingAddress = {
          ...address,
          country_code: (address.country_code || "").toLowerCase(),
        };

        const { cart } = await this.client.store.cart.update(cartId, {
            shipping_address: normalizedAddress,
        });
        return cart;
        } catch (error: any) {
        this.logger.error("Error updating shipping address", error);
        
        // Log deep error details if available (only in dev)
        if (error.response && import.meta.env.DEV) {
            this.logger.error("Upstream Medusa Error Data", error, { data: error.response.data });
        }

        throw error;
        }
    });
  }

  /**
   * Generic cart update (email, address, etc.)
   * Uses Medusa v2 SDK: client.store.cart.update()
   */
  async updateCart(cartId: string, data: { 
    email?: string; 
    shipping_address?: ShippingAddress;
    billing_address?: Partial<ShippingAddress>;
    region_id?: string;
    sales_channel_id?: string;
    metadata?: Record<string, any>;
    promo_codes?: string[];
  }): Promise<Cart> {
    return retry(async () => {
        try {
            const payload: any = { ...data };
            
            // Normalize country code if address is present
            if (payload.shipping_address) {
                payload.shipping_address = {
                    ...payload.shipping_address,
                    country_code: (payload.shipping_address.country_code || "").toLowerCase(),
                };
            }

            const { cart } = await this.client.store.cart.update(cartId, payload);
            return cart;
        } catch (error: any) {
            this.logger.error("Error updating cart", error);
            if (error.response && import.meta.env.DEV) {
                this.logger.error("Upstream Medusa Error Data", error, { data: error.response.data });
            }
            throw error;
        }
    });
  }

  /**
   * Get shipping options for the cart
   * Uses Medusa v2 SDK: client.store.fulfillment.listCartOptions()
   * 
   * Medusa v2 returns tiered pricing via calculated_price object:
   * - calculated_amount: The price after rules are applied (e.g., free shipping over $99)
   */
  async getShippingOptions(cartId: string): Promise<ShippingOption[]> {
    return retry(async () => {
        try {
        const { shipping_options } = await this.client.store.fulfillment.listCartOptions({
            cart_id: cartId,
        });

        return (shipping_options || [])
            // Filter out return shipping options - only show forward shipping
            .filter((opt: any) => !opt.is_return)
            .map((opt: any) => {
                // Medusa v2: Use calculated_price for tiered/rule-based pricing
                const calculatedPrice = opt.calculated_price;
                const amount = calculatedPrice?.calculated_amount ?? opt.amount ?? 0;
                
                return {
                    id: opt.id,
                    name: opt.name,
                    amount,
                    price_type: opt.price_type,
                    provider_id: opt.provider_id,
                    is_return: opt.is_return,
                };
            });
        } catch (error) {
        console.error("Error fetching shipping options:", error);
        throw error;
        }
    });
  }

  /**
   * Add a shipping method to the cart
   * Uses Medusa v2 SDK: client.store.cart.addShippingMethod()
   * 
   * This persists the customer's shipping selection to the cart so it
   * is available when the order is created from the cart data.
   * 
   * SHP-01: Fix shipping option not being persisted
   */
  async addShippingMethod(cartId: string, optionId: string): Promise<Cart> {
    return retry(async () => {
      try {
        const { cart } = await this.client.store.cart.addShippingMethod(cartId, {
          option_id: optionId,
        });
        return cart;
      } catch (error: any) {
        // ... omitted status check for brevity ...
        const status = error.status || error.response?.status;
        if (status >= 400 && status < 500) {
          throw error;
        }
        console.error(`Error adding shipping method ${optionId} to cart ${cartId}:`, error);
        throw error;
      }
    });
  }

  /**
   * Transfer cart to the authenticated customer
   * Uses Medusa v2 SDK: client.store.cart.transfer()
   */
  async transferCart(cartId: string): Promise<Cart> {
    return retry(async () => {
      try {
        const { cart } = await this.client.store.cart.transfer(cartId);
        return cart;
      } catch (error: any) {
        this.logger.error(`Error transferring cart ${cartId}`, error);
        throw error;
      }
    });
  }
}
