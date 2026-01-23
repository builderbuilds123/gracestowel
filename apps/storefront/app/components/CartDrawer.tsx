import { X, Minus, Plus, Sparkles, Towel } from '../lib/icons';
import { useCart } from '../context/CartContext';
import { useLocale } from '../context/LocaleContext';
import { Link } from 'react-router';
import { CartProgressBar } from './CartProgressBar';
import { ProductPrice } from './ProductPrice';
import { useAutomaticPromotions } from '../hooks/useAutomaticPromotions';
import { Image } from './ui/Image';

export function CartDrawer() {
    const { items, isOpen, toggleCart, removeFromCart, updateQuantity, cartTotal, isSyncing } = useCart();
    const { formatPrice, t } = useLocale();
    
    // PROMO-1 Phase 3: Fetch free shipping threshold from backend
    const { freeShippingThreshold } = useAutomaticPromotions({
        cartSubtotal: cartTotal,
        enabled: isOpen && items.length > 0,
    });

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={toggleCart}
                className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                aria-hidden={!isOpen}
            />

            {/* Drawer */}
            <div
                className={`fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out transform ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                aria-hidden={!isOpen}
            >
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-2xl font-serif text-text-earthy flex items-center gap-2">
                        <Towel size={24} weight="regular" />
                        {t('cart.title')}
                    </h2>
                    <button onClick={toggleCart} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-text-earthy" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {items.length > 0 && freeShippingThreshold !== null ? (
                        <CartProgressBar 
                            currentAmount={cartTotal}
                            threshold={freeShippingThreshold}
                            type="free_shipping"
                        />
                    ) : null}
                    {items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-text-earthy/60">
                            <Towel size={64} weight="thin" className="mb-4 opacity-20" />
                            <p className="text-lg">{t('cart.empty')}</p>
                            <button
                                onClick={toggleCart}
                                className="mt-4 text-accent-earthy hover:underline"
                            >
                                {t('nav.shop')}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {items.map((item) => (
                                <div key={`${item.id}-${item.color || 'default'}`} className="flex gap-4">
                                    <div className="w-24 h-24 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                                        <Image src={item.image} alt={item.title} width={96} height={96} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-medium text-text-earthy">{item.title}</h3>
                                                {item.embroidery ? (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Sparkles className="w-3 h-3 text-accent-earthy" />
                                                        <span className="text-xs text-accent-earthy">Custom Embroidery</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.id, item.color, item.variantId)}
                                                className="text-text-earthy/40 hover:text-red-500 transition-colors"
                                                aria-label={`Remove ${item.title} from cart`}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {item.color ? (
                                            <p className="text-xs text-text-earthy/60 mb-2">Color: {item.color}</p>
                                        ) : null}
                                        {item.embroidery ? (
                                            <div className="mb-3 p-2 bg-accent-earthy/5 rounded border border-accent-earthy/20">
                                                {item.embroidery.type === 'text' ? (
                                                    <div
                                                        className="text-sm text-center"
                                                        style={{
                                                            fontFamily: item.embroidery.font,
                                                            color: item.embroidery.color,
                                                            textShadow: '1px 1px 0 rgba(0,0,0,0.1)'
                                                        }}
                                                    >
                                                        {item.embroidery.data}
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={item.embroidery.data}
                                                        alt="Custom embroidery"
                                                        className="w-full h-16 object-contain rounded"
                                                    />
                                                )}
                                            </div>
                                        ) : null}
                                        <ProductPrice
                                            price={item.price}
                                            originalPrice={item.originalPrice}
                                            className="mb-4"
                                        />
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => updateQuantity(item.id, item.quantity - 1, item.color, item.variantId)}
                                                className="p-1 rounded-full hover:bg-gray-100 border border-gray-200"
                                                aria-label={`Decrease ${item.title} quantity`}
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-8 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.id, item.quantity + 1, item.color, item.variantId)}
                                                className="p-1 rounded-full hover:bg-gray-100 border border-gray-200"
                                                aria-label={`Increase ${item.title} quantity`}
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {items.length > 0 ? (
                    <div className="p-6 border-t border-gray-100 bg-gray-50">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex flex-col">
                                <span className="text-text-earthy/60">{t('cart.subtotal')}</span>
                                {isSyncing ? (
                                    <span className="text-[10px] text-accent-earthy animate-pulse">Syncing...</span>
                                ) : null}
                            </div>
                            <span className="text-xl font-bold text-text-earthy">{formatPrice(cartTotal)}</span>
                        </div>
                        <p className="text-xs text-text-earthy/40 mb-4 text-center">Shipping and taxes calculated at checkout.</p>
                        <div className="flex gap-2 mb-4">
                            <Link
                                to="/towels"
                                onClick={toggleCart}
                                className="flex-1 py-3 bg-white border-2 border-accent-earthy text-accent-earthy text-center font-semibold rounded hover:bg-accent-earthy/10 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus className="w-5 h-5" />
                                Add More Items
                            </Link>
                        </div>
                        <Link
                            to="/checkout"
                            onClick={toggleCart}
                            prefetch="intent"
                            className="block w-full py-4 bg-accent-earthy text-white text-center font-semibold rounded hover:bg-accent-earthy/90 transition-colors shadow-lg"
                        >
                            {t('cart.checkout')}
                        </Link>
                    </div>
                ) : null}
            </div>
        </>
    );
}
