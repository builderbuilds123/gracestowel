export interface CartItem {
  unit_price: number; // in cents
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  shipping_total: number;
  discount_total: number;
  tax_total: number;
}

/**
 * Calculate cart subtotal from items
 */
export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity),
    0
  );
}

/**
 * Calculate total amount for PaymentIntent
 */
export function calculatePaymentIntentAmount(cart: Cart): number {
  const subtotal = calculateSubtotal(cart.items);
  const total = subtotal + cart.shipping_total - cart.discount_total + cart.tax_total;

  // Amount must be positive
  return Math.max(0, Math.round(total));
}

/**
 * Convert dollars to cents
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function fromCents(cents: number): number {
  return cents / 100;
}
