import { useState, useEffect, useCallback, useRef } from "react";
import { Minus, Plus, ShoppingBag, Check, Truck } from "lucide-react";
import { Towel } from "@phosphor-icons/react";

interface StickyPurchaseBarProps {
  productTitle: string;
  price: number;
  originalPrice?: number;
  currencySymbol?: string;
  selectedColor: string;
  colorHex?: string;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
  isOutOfStock: boolean;
  showAfterScroll?: number; // pixels to scroll before showing
  freeShippingThreshold?: number; // in dollars (e.g., 75 for $75)
  cartTotal?: number; // current cart total in dollars
  onViewCart?: () => void; // callback to open cart
  cartItemCount?: number; // number of items in cart
}

/**
 * Sticky bottom purchase bar with satisfying interactions
 * Appears after scrolling past hero, always accessible
 */
export function StickyPurchaseBar({
  productTitle,
  price,
  originalPrice,
  currencySymbol = "$",
  selectedColor,
  colorHex,
  quantity,
  onQuantityChange,
  onAddToCart,
  isOutOfStock,
  showAfterScroll = 600,
  freeShippingThreshold = 75, // $75
  cartTotal = 0,
  onViewCart,
  cartItemCount = 0,
}: StickyPurchaseBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Show/hide based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > showAfterScroll);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [showAfterScroll]);

  // Calculate shipping progress
  const itemTotal = price * quantity;
  const projectedTotal = cartTotal + itemTotal;
  const shippingProgress = Math.min(100, (projectedTotal / freeShippingThreshold) * 100);
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - projectedTotal);

  // Handle add to cart with animation
  const handleAddToCart = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isOutOfStock || isAdding) return;

      // Create ripple effect at click position
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setRipple({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }

      setIsAdding(true);

      // Simulate adding delay for UX
      setTimeout(() => {
        onAddToCart();
        setIsAdding(false);
        setShowSuccess(true);
        setRipple(null);

        // Reset success state
        setTimeout(() => setShowSuccess(false), 2000);
      }, 300);
    },
    [isOutOfStock, isAdding, onAddToCart]
  );

  return (
    <>
      {/* Spacer to prevent content jump */}
      <div className={`h-0 transition-all duration-300 ${isVisible ? "h-24" : ""}`} />

      {/* Sticky bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-bg-earthy/95 backdrop-blur-sm border-t border-card-earthy/30 transition-transform duration-500 ease-out safe-area-bottom ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
        role="region"
        aria-label="Quick purchase bar"
      >
        {/* Free shipping progress (optional) */}
        {freeShippingThreshold > 0 && amountToFreeShipping > 0 && (
          <div className="bg-card-earthy/20 py-2 px-4">
            <div className="max-w-5xl mx-auto flex items-center gap-3">
              <Truck className="w-4 h-4 text-accent-earthy flex-shrink-0" />
              <div className="flex-1">
                <div className="h-1.5 bg-card-earthy/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-earthy rounded-full transition-all duration-500"
                    style={{ width: `${shippingProgress}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-text-earthy/60 flex-shrink-0">
                {currencySymbol}
                {amountToFreeShipping.toFixed(0)} to free shipping
              </span>
            </div>
          </div>
        )}

        {/* Main bar content */}
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4 md:gap-6">
            {/* Product info (hidden on very small screens) */}
            <div className="hidden sm:flex items-center gap-3 flex-1 min-w-0">
              {/* Color indicator */}
              {colorHex && (
                <span
                  className="w-6 h-6 rounded-full border-2 border-text-earthy/20 flex-shrink-0"
                  style={{ backgroundColor: colorHex }}
                  aria-label={`Color: ${selectedColor}`}
                />
              )}

              {/* Title and price */}
              <div className="min-w-0">
                <h3 className="font-serif text-text-earthy truncate">
                  {productTitle}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-accent-earthy font-semibold">
                    {currencySymbol}
                    {price.toFixed(2)}
                  </span>
                  {originalPrice && originalPrice > price && (
                    <span className="text-sm text-text-earthy/50 line-through">
                      {currencySymbol}
                      {originalPrice.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quantity selector */}
            <div className="flex items-center gap-1 bg-card-earthy/20 rounded-full p-1">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                aria-label="Decrease quantity"
              >
                <Minus className="w-4 h-4" />
              </button>

              <span className="w-8 text-center font-medium text-text-earthy">
                {quantity}
              </span>

              <button
                onClick={() => onQuantityChange(quantity + 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 transition-all duration-200 active:scale-95"
                aria-label="Increase quantity"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Add to Cart button */}
              <button
                ref={buttonRef}
                onClick={handleAddToCart}
                disabled={isOutOfStock || isAdding}
                className={`relative flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-medium transition-all duration-300 overflow-hidden ${
                  isOutOfStock
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : showSuccess
                    ? "bg-green-500 text-white"
                    : "bg-accent-earthy text-white hover:bg-accent-earthy/90 hover:shadow-soft active:scale-98"
                }`}
                aria-busy={isAdding}
              >
                {/* Ripple effect */}
                {ripple && (
                  <span
                    className="absolute w-4 h-4 bg-white/40 rounded-full animate-ripple"
                    style={{
                      left: ripple.x - 8,
                      top: ripple.y - 8,
                    }}
                  />
                )}

                {/* Button content */}
                {isOutOfStock ? (
                  "Out of Stock"
                ) : showSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span className="hidden sm:inline">Added!</span>
                  </>
                ) : isAdding ? (
                  <>
                    <Towel weight="fill" className="w-5 h-5 animate-float-up" />
                    <span className="hidden sm:inline">Adding...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-5 h-5" />
                    <span className="hidden sm:inline">Add to Cart</span>
                    <span className="sm:hidden">Add</span>
                  </>
                )}
              </button>

              {/* View Cart button - shows when cart has items */}
              {onViewCart && cartItemCount > 0 && (
                <button
                  onClick={onViewCart}
                  className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-full font-medium border-2 border-accent-earthy text-accent-earthy hover:bg-accent-earthy hover:text-white transition-all duration-300 active:scale-98"
                  aria-label={`View cart with ${cartItemCount} items`}
                >
                  <ShoppingBag className="w-5 h-5" />
                  {/* Item count badge */}
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent-earthy text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {cartItemCount > 9 ? "9+" : cartItemCount}
                  </span>
                </button>
              )}
            </div>

            {/* Total (mobile) */}
            <div className="sm:hidden text-right">
              <span className="text-lg font-semibold text-accent-earthy">
                {currencySymbol}
                {(price * quantity).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating success animation (towel floating to cart) */}
      {showSuccess && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          aria-hidden="true"
        >
          <div className="animate-float-up">
            <Towel weight="fill" className="w-8 h-8 text-accent-earthy" />
          </div>
        </div>
      )}
    </>
  );
}
