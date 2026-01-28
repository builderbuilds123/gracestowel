import { useState, useEffect, useCallback } from "react";
import { Minus, Plus, ShoppingBag, Check, Truck } from "../../lib/icons";

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
  showAfterScroll?: number;
  freeShippingThreshold?: number;
  cartTotal?: number;
  onViewCart?: () => void;
  cartItemCount?: number;
}

/**
 * Sticky bottom purchase bar
 * Appears after scrolling, always accessible
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
  showAfterScroll = 400,
  freeShippingThreshold = 75,
  cartTotal = 0,
  onViewCart,
  cartItemCount = 0,
}: StickyPurchaseBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > showAfterScroll);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [showAfterScroll]);

  const itemTotal = price * quantity;
  const projectedTotal = cartTotal + itemTotal;
  const shippingProgress = Math.min(100, (projectedTotal / freeShippingThreshold) * 100);
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - projectedTotal);

  const handleAddToCart = useCallback(() => {
    if (isOutOfStock || isAdding) return;

    setIsAdding(true);
    setTimeout(() => {
      onAddToCart();
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }, 150);
  }, [isOutOfStock, isAdding, onAddToCart]);

  return (
    <>
      {/* Spacer to prevent content jump */}
      <div className={`h-0 transition-all duration-300 ${isVisible ? "h-24" : ""}`} />

      {/* Sticky bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-bg-earthy/95 backdrop-blur-sm border-t border-card-earthy/30 transition-transform duration-300 safe-area-bottom ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
        role="region"
        aria-label="Quick purchase bar"
      >
        {/* Free shipping progress */}
        {freeShippingThreshold > 0 && amountToFreeShipping > 0 ? (
          <div className="bg-card-earthy/20 py-2 px-4">
            <div className="max-w-5xl mx-auto flex items-center gap-3">
              <Truck className="w-4 h-4 text-accent-earthy flex-shrink-0" />
              <div className="flex-1">
                <div className="h-1.5 bg-card-earthy/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-earthy rounded-full"
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
        ) : null}

        {/* Main bar content */}
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4 md:gap-6">
            {/* Product info (hidden on very small screens) */}
            <div className="hidden sm:flex items-center gap-3 flex-1 min-w-0">
              {colorHex ? (
                <span
                  className="w-6 h-6 rounded-full border-2 border-text-earthy/20 flex-shrink-0"
                  style={{ backgroundColor: colorHex }}
                  aria-label={`Color: ${selectedColor}`}
                />
              ) : null}

              <div className="min-w-0">
                <h3 className="font-serif text-text-earthy truncate">
                  {productTitle}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-accent-earthy font-semibold">
                    {currencySymbol}
                    {price.toFixed(2)}
                  </span>
                  {originalPrice && originalPrice > price ? (
                    <span className="text-sm text-text-earthy/50 line-through">
                      {currencySymbol}
                      {originalPrice.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Quantity selector */}
            <div className="flex items-center gap-1 bg-card-earthy/20 rounded-full p-1">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-4 h-4" />
              </button>

              <span className="w-8 text-center font-medium text-text-earthy">
                {quantity}
              </span>

              <button
                onClick={() => onQuantityChange(quantity + 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock || isAdding}
                className={`flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-medium transition-colors ${
                  isOutOfStock
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : showSuccess
                    ? "bg-green-500 text-white"
                    : "bg-accent-earthy text-white hover:bg-accent-earthy/90"
                }`}
                aria-busy={isAdding}
              >
                {isOutOfStock ? (
                  "Out of Stock"
                ) : showSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span className="hidden sm:inline">Added!</span>
                  </>
                ) : isAdding ? (
                  "Adding..."
                ) : (
                  <>
                    <ShoppingBag className="w-5 h-5" />
                    <span className="hidden sm:inline">Add to Cart</span>
                    <span className="sm:hidden">Add</span>
                  </>
                )}
              </button>

              {onViewCart && cartItemCount > 0 ? (
                <button
                  onClick={onViewCart}
                  className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-full font-medium border-2 border-accent-earthy text-accent-earthy hover:bg-accent-earthy hover:text-white transition-colors"
                  aria-label={`View cart with ${cartItemCount} items`}
                >
                  <ShoppingBag className="w-5 h-5" />
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent-earthy text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {cartItemCount > 9 ? "9+" : cartItemCount}
                  </span>
                </button>
              ) : null}
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
    </>
  );
}
