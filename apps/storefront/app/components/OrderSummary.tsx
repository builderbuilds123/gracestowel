import React, { memo, useCallback, useState } from 'react';
import { X, Minus, Plus, Loader2 } from '../lib/icons';
import { ProductPrice } from './ProductPrice';
import { PromoCodeInput } from './PromoCodeInput';
import { AutomaticPromotionBanner } from './AutomaticPromotionBanner';
import { QuickAddProductDialog } from './QuickAddProductDialog';
import { Image } from './ui/Image';
import type { CartItem } from '../context/CartContext';
import type { ProductId } from '../types/product';

import { useCheckout } from './checkout/CheckoutProvider';
import { useLocale } from '../context/LocaleContext';

export interface OrderSummaryProps {
}

/**
 * OrderSummary Component
 *
 * Displays the cart summary with pricing that follows industry best practices:
 * - Subtotal: Always shows immediate local calculation (no loading state needed)
 * - Discount/Shipping/Total: Shows loading skeleton when backend is syncing
 *
 * @see https://shopify.dev/docs/api/hydrogen/2024-10/hooks/useoptimisticcart
 * @see https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
 */
export function OrderSummary() {
    const {
        items,
        displayCartTotal: cartTotal,
        originalTotal,
        state: checkoutState,
        displayShippingCost: shippingCost,
        displayFinalTotal: finalTotal,
        updateQuantity: onUpdateQuantity,
        removeFromCart: onRemoveFromCart,
        cartId,
        appliedPromoCodes,
        applyPromoCode: onApplyPromoCode,
        removePromoCode: onRemovePromoCode,
        isPromoLoading,
        promoError,
        promoSuccessMessage,
        displayDiscountTotal: discountTotal,
        automaticPromotions,
        isSyncing,
        hasActiveDiscount,
    } = useCheckout();

    const { regionId } = useLocale();
    const [showAddProductDialog, setShowAddProductDialog] = useState(false);

    const { selectedShippingOption: selectedShipping } = checkoutState;

    // Determine if backend-dependent prices should show loading state
    // Subtotal never needs loading (calculated locally)
    // Discount, Shipping, and Total need loading when syncing
    const showPriceLoading = isSyncing;

    return (
        <div className="lg:col-span-5 bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20 sticky top-8">
            {/* Header */}
            <h3 className="font-serif text-lg text-text-earthy mb-4">Your Order</h3>

            {/* Cart Items */}
            <div className="space-y-6 mb-4">
                {items.map((item) => (
                    <OrderItem
                        key={`${item.id}-${item.color || 'default'}`}
                        item={item}
                        onUpdateQuantity={onUpdateQuantity}
                        onRemove={onRemoveFromCart}
                    />
                ))}
            </div>

            {/* Add More Products - Inline expandable for upselling */}
            <QuickAddProductDialog
                isOpen={showAddProductDialog}
                onToggle={() => setShowAddProductDialog(!showAddProductDialog)}
                regionId={regionId}
            />

            {/* Automatic Promotion Banners (Phase 2) */}
            {automaticPromotions.length > 0 && (
                <div className="space-y-2 mb-4">
                    {automaticPromotions.map((promo) => (
                        <AutomaticPromotionBanner
                            key={promo.id}
                            type={promo.type}
                            message={promo.message}
                            isApplied={promo.isApplied}
                            progressPercent={promo.progressPercent}
                        />
                    ))}
                </div>
            )}

            {/* Promo Code Input */}
            <PromoCodeInput
                cartId={cartId}
                appliedCodes={appliedPromoCodes}
                onApply={onApplyPromoCode}
                onRemove={onRemovePromoCode}
                isLoading={isPromoLoading}
                error={promoError}
                successMessage={promoSuccessMessage}
            />

            {/* Totals Section */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* Subtotal - Always shows immediately (calculated locally) */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-text-earthy">
                        ${originalTotal.toFixed(2)}
                    </span>
                </div>

                {/* Discount - Shows loading skeleton when syncing */}
                {(hasActiveDiscount || isPromoLoading) && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Discount</span>
                        {isPromoLoading || showPriceLoading ? (
                            <span className="inline-block w-16 h-5 bg-gray-200 rounded animate-pulse" />
                        ) : (
                            <span className="font-medium text-green-600">
                                -${discountTotal.toFixed(2)}
                            </span>
                        )}
                    </div>
                )}

                {/* Shipping - Shows loading skeleton when syncing */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    {showPriceLoading ? (
                        <span className="inline-block w-16 h-5 bg-gray-200 rounded animate-pulse" />
                    ) : selectedShipping ? (
                        <div className="flex items-center gap-2">
                            {selectedShipping.isFree && selectedShipping.originalAmount !== undefined && (
                                <span className="text-text-earthy/40 line-through text-sm">
                                    ${selectedShipping.originalAmount.toFixed(2)}
                                </span>
                            )}
                            <span className={`font-medium ${selectedShipping.isFree ? 'text-green-600' : 'text-text-earthy'}`}>
                                ${selectedShipping.amount.toFixed(2)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-gray-500 italic text-sm">Calculated at next step</span>
                    )}
                </div>

                {/* Total - Shows loading skeleton when syncing */}
                <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-2">
                    <span className="text-text-earthy">Total</span>
                    <div className="flex items-center gap-2">
                        {hasActiveDiscount && !showPriceLoading && (
                            <span className="text-text-earthy/40 line-through text-sm font-normal">
                                ${(originalTotal + (selectedShipping?.amount ?? 0)).toFixed(2)}
                            </span>
                        )}
                        {showPriceLoading ? (
                            <span className="inline-block w-20 h-6 bg-gray-200 rounded animate-pulse" />
                        ) : (
                            <span className={hasActiveDiscount ? 'text-green-600' : 'text-accent-earthy'}>
                                ${finalTotal.toFixed(2)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}

interface OrderItemProps {
    item: CartItem;
    onUpdateQuantity: (id: ProductId, quantity: number, color?: string, variantId?: string) => void;
    onRemove: (id: ProductId, color?: string) => void;
}

// Memoize list items to prevent re-renders when siblings change
const OrderItem = memo(function OrderItem({ item, onUpdateQuantity, onRemove }: OrderItemProps) {
    const handleDecrement = useCallback(() => {
        onUpdateQuantity(item.id, item.quantity - 1, item.color, item.variantId);
    }, [onUpdateQuantity, item.id, item.quantity, item.color, item.variantId]);

    const handleIncrement = useCallback(() => {
        onUpdateQuantity(item.id, item.quantity + 1, item.color, item.variantId);
    }, [onUpdateQuantity, item.id, item.quantity, item.color, item.variantId]);

    const handleRemove = useCallback(() => {
        onRemove(item.id, item.color);
    }, [onRemove, item.id, item.color]);

    return (
        <div className="flex gap-4">
            <div className="w-20 h-20 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                <Image src={item.image} alt={item.title} width={80} height={80} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-medium text-text-earthy truncate">{item.title}</h3>
                        {item.color && (
                            <p className="text-xs text-text-earthy/60 mt-1">Color: {item.color}</p>
                        )}
                    </div>
                    <button
                        onClick={handleRemove}
                        className="text-text-earthy/40 hover:text-red-500 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex justify-between items-end mt-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDecrement}
                            className="p-1 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                        >
                            <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-4 text-center text-sm">{item.quantity}</span>
                        <button
                            onClick={handleIncrement}
                            className="p-1 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <ProductPrice
                        price={item.price}
                        originalPrice={item.originalPrice}
                    />
                </div>
            </div>
        </div>
    );
});

export default OrderSummary;
