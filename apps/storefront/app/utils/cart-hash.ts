/**
 * Simple hashing function for cart items to generate a cache key
 */
import type { CartItem } from "../types/product";

export function generateCartHash(
  cartItems: CartItem[],
  address?: {
    country_code: string;
    province?: string;
    postal_code: string;
  },
  currency: string = "CAD",
  cartTotal: number = 0
): string {
  const itemsString = cartItems
    .map(
      (item) =>
        `${item.id}-${item.variantId}-${item.quantity}`
    )
    .sort()
    .join("|");

  const addressString = address
    ? `${address.country_code}-${address.province || ""}-${address.postal_code}`
    : "no-address";

  return `${itemsString}__${addressString}__${currency}__${cartTotal}`;
}
