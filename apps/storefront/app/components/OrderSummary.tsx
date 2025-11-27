import { X, Minus, Plus } from 'lucide-react';
import { ProductPrice } from './ProductPrice';
import type { CartItem } from '../context/CartContext';
import type { ShippingOption } from './CheckoutForm';

export interface OrderSummaryProps {
    items: CartItem[];
    cartTotal: number;
    originalTotal: number;
    selectedShipping: ShippingOption | null;
    shippingCost: number;
    finalTotal: number;
    onUpdateQuantity: (id: number, quantity: number) => void;
    onRemoveFromCart: (id: number, color?: string) => void;
}

const FREE_GIFT_COLOR = 'Free Gift';
const DRYER_BALL_ID = 4;

function isFreeGift(item: CartItem): boolean {
    return item.color === FREE_GIFT_COLOR;
}

export function OrderSummary({
    items,
    cartTotal,
    originalTotal,
    selectedShipping,
    shippingCost,
    finalTotal,
    onUpdateQuantity,
    onRemoveFromCart,
}: OrderSummaryProps) {
    const hasDiscount = originalTotal > cartTotal;

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

            {/* Totals */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <div className="flex items-center gap-2">
                        {hasDiscount && (
                            <span className="text-text-earthy/40 line-through text-sm">
                                ${originalTotal.toFixed(2)}
                            </span>
                        )}
                        <span className={`font-medium ${hasDiscount ? 'text-green-600' : 'text-text-earthy'}`}>
                            ${cartTotal.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Shipping */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    {selectedShipping ? (
                        <div className="flex items-center gap-2">
                            {selectedShipping.isFree && selectedShipping.originalAmount && (
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

                {/* Total */}
                <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-2">
                    <span className="text-text-earthy">Total</span>
                    {shippingCost > 0 || selectedShipping?.isFree ? (
                        <div className="flex items-center gap-2">
                            <span className="text-text-earthy/40 line-through text-sm">
                                ${(originalTotal + (selectedShipping?.originalAmount || 0)).toFixed(2)}
                            </span>
                            <span className="text-green-600">${finalTotal.toFixed(2)}</span>
                        </div>
                    ) : (
                        <span className="text-accent-earthy">${finalTotal.toFixed(2)}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

interface OrderItemProps {
    item: CartItem;
    onUpdateQuantity: (id: number, quantity: number) => void;
    onRemove: (id: number, color?: string) => void;
}

function OrderItem({ item, onUpdateQuantity, onRemove }: OrderItemProps) {
    const isGift = isFreeGift(item);
    const isDryerBall = item.id === DRYER_BALL_ID;
    const isFreeItem = isDryerBall && item.price === '$0.00';

    return (
        <div className="flex gap-4">
            <div className="w-20 h-20 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-medium text-text-earthy truncate">{item.title}</h3>
                        {item.color && !isDryerBall && (
                            <p className="text-xs text-text-earthy/60 mt-1">Color: {item.color}</p>
                        )}
                    </div>
                    {!isGift && (
                        <button
                            onClick={() => onRemove(item.id, item.color)}
                            className="text-text-earthy/40 hover:text-red-500 transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex justify-between items-end mt-2">
                    <div className="flex items-center gap-3">
                        {isFreeItem ? (
                            <span className="text-sm text-text-earthy/60">Qty: {item.quantity}</span>
                        ) : (
                            <>
                                <button
                                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                    className="p-1 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-4 text-center text-sm">{item.quantity}</span>
                                <button
                                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                    className="p-1 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </>
                        )}
                    </div>
                    <ProductPrice
                        price={item.price}
                        originalPrice={item.originalPrice}
                        showFreeLabel={isGift}
                    />
                </div>
            </div>
        </div>
    );
}

export default OrderSummary;

