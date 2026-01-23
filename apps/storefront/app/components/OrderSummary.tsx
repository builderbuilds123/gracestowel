import React from 'react';
import { X, Minus, Plus, Loader2 } from '../lib/icons';
import { ProductPrice } from './ProductPrice';
import { PromoCodeInput } from './PromoCodeInput';
import { AutomaticPromotionBanner } from './AutomaticPromotionBanner';
import { Image } from './ui/Image';
import type { CartItem } from '../context/CartContext';
import type { ShippingOption } from '../types/checkout';
import type { ProductId } from '../types/product';
import type { AppliedPromoCode } from '../types/promotion';
import type { AutomaticPromotionInfo } from '../hooks/useAutomaticPromotions';

import { useCheckout } from './checkout/CheckoutProvider';

export interface OrderSummaryProps {
}

// ✅ Memoized component to prevent unnecessary re-renders (Issue #7 fix)
export const OrderSummary = React.memo(function OrderSummary() {
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
    } = useCheckout();

    const { selectedShippingOption: selectedShipping } = checkoutState;
    const hasDiscount = originalTotal > cartTotal || discountTotal > 0;

    return (
        <div className="lg:col-span-5 bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20 sticky top-8">
            {/* Cart Items */}
            <div className="space-y-6 mb-6">
                {items.map((item) => (
                    <OrderItem
                        key={`${item.id}-${item.color || 'default'}`}
                        item={item}
                        onUpdateQuantity={onUpdateQuantity}
                        onRemove={onRemoveFromCart}
                    />
                ))}
            </div>

            {/* Automatic Promotion Banners (Phase 2) */}
            {automaticPromotions.length > 0 ? (
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
            ) : null}

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

            {/* Totals */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-600">Subtotal</span>
                        {isSyncing ? (
                            <Loader2 className="w-3 h-3 animate-spin text-accent-earthy" />
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                        {hasDiscount ? (
                            <span className="text-text-earthy/40 line-through text-sm">
                                ${originalTotal.toFixed(2)}
                            </span>
                        ) : null}
                        <span className={`font-medium ${hasDiscount ? 'text-green-600' : 'text-text-earthy'}`}>
                            ${cartTotal.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Discount (from promo codes) */}
                {(discountTotal > 0 || isPromoLoading) ? (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Discount</span>
                        {isPromoLoading ? (
                            <span className="flex items-center gap-1 text-gray-500">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-xs">Calculating...</span>
                            </span>
                        ) : (
                            <span className="font-medium text-green-600">
                                -${discountTotal.toFixed(2)}
                            </span>
                        )}
                    </div>
                ) : null}

                {/* Shipping */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    {selectedShipping ? (
                        <div className="flex items-center gap-2">
                            {selectedShipping.isFree && selectedShipping.originalAmount !== undefined ? (
                                <span className="text-text-earthy/40 line-through text-sm">
                                    ${selectedShipping.originalAmount.toFixed(2)}
                                </span>
                            ) : null}
                            <span className={`font-medium ${selectedShipping.isFree ? 'text-green-600' : 'text-text-earthy'}`}>
                                ${selectedShipping.amount.toFixed(2)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-gray-500 italic text-sm">Calculated at next step</span>
                    )}
                </div>

                {/* Total */}
                <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-2">
                    <span className="text-text-earthy">Total</span>
                    <span className="text-accent-earthy">${finalTotal.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}, () => {
    // OrderSummary has no props, but memo prevents re-renders
    // when parent re-renders without prop changes
    return true; // Always return true (no props to compare)
});

interface OrderItemProps {
    item: CartItem;
    onUpdateQuantity: (id: ProductId, quantity: number, color?: string, variantId?: string) => void;
    onRemove: (id: ProductId, color?: string) => void;
}

function OrderItem({ item, onUpdateQuantity, onRemove }: OrderItemProps) {
    return (
        <div className="flex gap-4">
            <div className="w-20 h-20 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                <Image src={item.image} alt={item.title} width={80} height={80} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-medium text-text-earthy truncate">{item.title}</h3>
                        {item.color ? (
                            <p className="text-xs text-text-earthy/60 mt-1">Color: {item.color}</p>
                        ) : null}
                    </div>
                    <button
                        onClick={() => onRemove(item.id, item.color)}
                        className="text-text-earthy/40 hover:text-red-500 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex justify-between items-end mt-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onUpdateQuantity(item.id, item.quantity - 1, item.color, item.variantId)}
                            className="p-1 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                        >
                            <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-4 text-center text-sm">{item.quantity}</span>
                        <button
                            onClick={() => onUpdateQuantity(item.id, item.quantity + 1, item.color, item.variantId)}
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
}

export default OrderSummary;

