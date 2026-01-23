import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { calculateTotal, fromCents } from '../lib/price';
import type { ProductId, CartItem, EmbroideryData } from '../types/product';
import { productIdsEqual } from '../types/product';
import { monitoredFetch } from '../utils/monitored-fetch';
import { useMedusaCart } from './MedusaCartContext';
import { useLocale } from './LocaleContext';
import type { CartWithPromotions } from '../types/promotion';
import { getBackendUrl } from '../lib/medusa';
import { createLogger } from '../lib/logger';
import { getCachedStorage, setCachedStorage } from '../lib/storage-cache';

// Re-export CartItem for backwards compatibility
export type { CartItem, EmbroideryData } from '../types/product';

// Story 3.1: Active order expiry (24 hours default)
const ACTIVE_ORDER_EXPIRY_MS = parseInt(
  import.meta.env.ACTIVE_ORDER_EXPIRY_HOURS || "24",
  10
) * 60 * 60 * 1000;

/**
 * Story 3.1: Active Order Data Structure
 * Represents a recently placed order that can be modified
 */
export interface ActiveOrderData {
  orderId: string;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    thumbnail?: string;
    unit_price: number;
  }>;
  shippingAddress: {
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    postal_code: string;
    country_code: string;
  };
  shippingMethodId: string;
  email: string;
  customerName: string;
  createdAt: string;
}

interface CartContextType {
    items: CartItem[];
    isOpen: boolean;
    isLoaded: boolean;
    addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
    removeFromCart: (id: ProductId, color?: string, variantId?: string) => void;
    updateQuantity: (id: ProductId, quantity: number, color?: string, variantId?: string) => void;
    toggleCart: () => void;
    clearCart: () => void;
    cartTotal: number;
    medusaCart?: CartWithPromotions | null;
    isLoading: boolean;
    isSyncing: boolean;
    // Story 3.1: Active order state for modification
    activeOrder: ActiveOrderData | null;
    isModifyingOrder: boolean;
    setActiveOrder: (data: ActiveOrderData) => void;
    clearActiveOrder: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    // Story 3.1: Active order state
    const [activeOrder, setActiveOrderState] = useState<ActiveOrderData | null>(null);
    const cartCreateInFlight = React.useRef(false);
    const lastSyncRequestId = React.useRef(0);
    const { cartId, cart: medusaCart, setCartId, isLoading, refreshCart } = useMedusaCart();
    const { regionId } = useLocale();

    // Story 3.1: Load active order from sessionStorage on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        const stored = sessionStorage.getItem("activeOrder");
        if (stored) {
            try {
                const data: ActiveOrderData = JSON.parse(stored);
                const age = Date.now() - new Date(data.createdAt).getTime();

                if (age < ACTIVE_ORDER_EXPIRY_MS) {
                    setActiveOrderState(data);
                } else {
                    sessionStorage.removeItem("activeOrder");
                }
            } catch {
                sessionStorage.removeItem("activeOrder");
            }
        }
    }, []);

    // Validate cart item integrity
    const validateCartItem = (item: any): boolean => {
        if (!item.id) return false;
        if (!item.title || typeof item.title !== 'string') return false;
        if (!item.price || typeof item.price !== 'string') return false;
        if (typeof item.quantity !== 'number' || item.quantity <= 0) return false;
        return true;
    };

    // Load cart from local storage on mount (Issue #17: Use cached storage)
    useEffect(() => {
        const savedCart = getCachedStorage('cart');
        if (savedCart) {
            try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed)) {
                    const validItems = parsed.filter(validateCartItem);
                    if (validItems.length !== parsed.length) {
                        const logger = createLogger({ context: "CartContext" });
                        logger.warn("Purged invalid items from local storage", {
                            removedCount: parsed.length - validItems.length,
                            totalItems: parsed.length,
                            validItems: validItems.length
                        });
                    }
                    setItems(validItems);
                }
            } catch (e) {
                const logger = createLogger({ context: "CartContext" });
                logger.error("Failed to parse cart from local storage", e instanceof Error ? e : new Error(String(e)));
                // If corrupted, clear it to self-heal
                localStorage.removeItem('cart');
            }
        }
        setIsLoaded(true);
    }, []);

    // ✅ Debounced localStorage writes with caching (Issues #9 & #17 fix)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            try {
                setCachedStorage('cart', JSON.stringify(items));
            } catch (e) {
                // Handle quota exceeded or other errors
                const logger = createLogger({ context: "CartContext" });
                logger.error("Failed to save to localStorage", e instanceof Error ? e : new Error(String(e)), { itemsCount: items.length });
            }
        }, 300); // Debounce by 300ms
        
        return () => clearTimeout(timeoutId);
    }, [items]);

    // Debounced sync with Medusa backend
    useEffect(() => {
        if (!cartId || !isLoaded) return;

        // Functional comparison to check if sync is actually needed
        // but since items is an object array, simple deep check or just relying on items ref is fine
        const requestId = ++lastSyncRequestId.current;

        const timeoutId = setTimeout(async () => {
            try {
                setIsSyncing(true);
                const response = await monitoredFetch(`/api/carts/${cartId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                    label: 'sync-cart-items-debounced',
                });

                // Ignore stale requests (Race Condition protection)
                if (requestId !== lastSyncRequestId.current) return;

                if (response.ok) {
                    await refreshCart();
                } else {
                    // If sync fails (e.g. invalid promo code), we still want to refresh
                    // to see what the backend currently thinks the cart is
                    const errorPayload = await response.json().catch(() => ({}));
                    const logger = createLogger({ context: "CartContext" });
                    logger.error('Sync failed', undefined, errorPayload as Record<string, unknown>);
                    await refreshCart();
                }
            } catch (err) {
                const logger = createLogger({ context: "CartContext" });
                logger.error('Failed to sync items with Medusa', err instanceof Error ? err : new Error(String(err)));
            } finally {
                if (requestId === lastSyncRequestId.current) {
                    setIsSyncing(false);
                }
            }
        }, 800); // Slightly faster debounce (800ms)

        return () => {
            clearTimeout(timeoutId);
        };
    }, [items, cartId, isLoaded, refreshCart]);

    // ✅ Memoize addToCart function (Issue #5 fix)
    const addToCart = useCallback((newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
        const quantityToAdd = newItem.quantity ?? 1;
        let image = newItem.image;
        if (typeof image === 'string' && image.startsWith('/uploads/')) {
            const base = getBackendUrl().replace(/\/$/, '');
            image = `${base}${image}`;
        }
        const itemToAdd = { ...newItem, image, quantity: quantityToAdd };
        // Fail loudly if inputs are invalid (User Requirement)
        if (!validateCartItem(itemToAdd)) {
            const logger = createLogger({ context: "CartContext" });
            const error = new Error(`Attempted to add invalid item to cart: ${JSON.stringify(itemToAdd)}`);
            logger.error("Attempted to add invalid item to cart", error, { item: itemToAdd });
            throw error;
        }

        setItems(prevItems => {
            const existingItem = prevItems.find(item => {
                if (newItem.variantId && item.variantId) {
                    return item.variantId === newItem.variantId;
                }
                if (newItem.variantId || item.variantId) {
                    return false;
                }
                return productIdsEqual(item.id, newItem.id) && item.color === newItem.color;
            });
            if (existingItem) {
                return prevItems.map(item =>
                    ((newItem.variantId && item.variantId)
                        ? item.variantId === newItem.variantId
                        : !newItem.variantId && !item.variantId && productIdsEqual(item.id, newItem.id) && item.color === newItem.color)
                        ? { ...item, quantity: item.quantity + quantityToAdd }
                        : item
                );
            }
            return [...prevItems, itemToAdd];
        });
        setIsOpen(true);

        // Fire-and-forget: ensure a Medusa cart exists on first cart interaction
        if (typeof window !== 'undefined' && !cartId && !cartCreateInFlight.current) {
            cartCreateInFlight.current = true;
            void (async () => {
                try {
                    const response = await monitoredFetch('/api/carts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ region_id: regionId }),
                        label: 'create-cart-on-add',
                    });
                    if (!response.ok) {
                        return;
                    }
                    const payload = await response.json() as { cart_id?: string };
                    if (payload.cart_id) {
                        setCartId(payload.cart_id);
                    }
                } catch {
                    // Non-blocking: cart creation failure should not prevent local cart updates
                } finally {
                    cartCreateInFlight.current = false;
                }
            })();
        }
    }, [cartId, regionId, setCartId]);

    // ✅ Memoize removeFromCart function (Issue #5 fix)
    const removeFromCart = useCallback((id: ProductId, color?: string, variantId?: string) => {
        setItems(prevItems => prevItems.filter(item => {
            if (variantId) {
                return item.variantId !== variantId;
            }
            if (color !== undefined) {
                return !(productIdsEqual(item.id, id) && item.color === color && !item.variantId);
            }
            return !(productIdsEqual(item.id, id) && !item.variantId);
        }));
    }, []);

    // ✅ Memoize updateQuantity function (Issue #5 fix)
    const updateQuantity = useCallback((id: ProductId, quantity: number, color?: string, variantId?: string) => {
        if (quantity <= 0) {
            removeFromCart(id, color);
            return;
        }

        setItems(prevItems =>
            prevItems.map(item => {
                let isMatch = false;
                if (variantId && item.variantId) {
                    isMatch = item.variantId === variantId;
                } else {
                    isMatch = productIdsEqual(item.id, id) && (color === undefined || item.color === color);
                }
                
                return isMatch ? { ...item, quantity } : item;
            })
        );
    }, []);

    // ✅ Memoize toggleCart function (Issue #5 fix)
    const toggleCart = useCallback(() => setIsOpen(prev => !prev), []);

    // ✅ Memoize clearCart function (Issue #5 fix)
    const clearCart = useCallback(() => {
        setItems([]);
        setIsOpen(false);
    }, []);

    // Story 3.1: Set active order (stores in sessionStorage)
    const setActiveOrder = useCallback((data: ActiveOrderData) => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem("activeOrder", JSON.stringify(data));
        }
        setActiveOrderState(data);
    }, []);

    // Story 3.1: Clear active order (removes from sessionStorage)
    const clearActiveOrder = useCallback(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem("activeOrder");
        }
        setActiveOrderState(null);
    }, []);

    // Story 3.1: Computed flag for order modification mode
    const isModifyingOrder = activeOrder !== null;

    // ✅ Optimized: Memoize the expensive calculation separately (Issue #8 fix)
    // Only recalculate when items actually change
    const localSubtotal = React.useMemo(
        () => calculateTotal(items),
        [items] // Only recalculate when items array reference changes
    );

    // Use the centralized price calculation utility
    // Optimistic calculation: Apply previous discount ratio to current local items
    // to prevent the "jump up" UI flicker while syncing (Story 5.4 optimization)
    const displayCartTotal = React.useMemo(() => {
        // Use pre-calculated localSubtotal
        if (medusaCart && items.length > 0) {
            // Calculate a temporary total based on Medusa's last known discount ratio
            // medusaCart.total is the final amount (inc. tax/shipping/discounts)
            // medusaCart.subtotal is the amount before tax/shipping but after discounts (in Medusa v2 terminology often)
            // But let's look at discount_total specifically
            const medusaDiscountTotal = medusaCart.discount_total || 0;
            const medusaOriginalSubtotal = medusaCart.item_total || medusaCart.subtotal || 1; // item_total is best
            
            if (medusaDiscountTotal > 0 && medusaOriginalSubtotal > 0) {
                const discountRatio = medusaDiscountTotal / medusaOriginalSubtotal;
                const estimatedTotal = localSubtotal * (1 - discountRatio);
                
                // If we're syncing, always show the estimate to stay consistent
                if (isSyncing) return estimatedTotal;
                
                // If not syncing, prefer the backend's precise total if available
                if (typeof medusaCart.subtotal === 'number') {
                    return medusaCart.subtotal;
                }
                
                return estimatedTotal;
            }
        }

        // If not syncing and we have a backend total, use it
        if (!isSyncing && typeof medusaCart?.subtotal === 'number') {
           return medusaCart.subtotal;
        }

        return localSubtotal;
    }, [localSubtotal, medusaCart, isSyncing, items.length]);

    // ✅ Memoize the provider value object (Issue #5 fix)
    // This prevents all consumers from re-rendering when the object reference changes
    const contextValue = React.useMemo(() => ({
        items, 
        isOpen, 
        isLoaded, 
        addToCart,      // Already stable (useCallback)
        removeFromCart,  // Already stable (useCallback)
        updateQuantity,  // Already stable (useCallback)
        toggleCart,      // Already stable (useCallback)
        clearCart,       // Already stable (useCallback)
        cartTotal: displayCartTotal,
        medusaCart,
        isLoading,
        isSyncing,
        // Story 3.1: Active order state
        activeOrder,
        isModifyingOrder,
        setActiveOrder,  // Stable function reference (useCallback)
        clearActiveOrder, // Stable function reference (useCallback)
    }), [
        items,           // Primitive array - reference changes when items change
        isOpen,          // Primitive boolean
        isLoaded,        // Primitive boolean
        addToCart,       // Stable function reference (useCallback)
        removeFromCart,  // Stable function reference (useCallback)
        updateQuantity,  // Stable function reference (useCallback)
        toggleCart,      // Stable function reference (useCallback)
        clearCart,       // Stable function reference (useCallback)
        displayCartTotal, // Memoized value
        medusaCart,      // Object - reference changes when cart updates
        isLoading,       // Primitive boolean
        isSyncing,       // Primitive boolean
        activeOrder,     // Object - reference changes when order changes
        isModifyingOrder, // Computed boolean
        setActiveOrder,  // Stable function reference (useCallback)
        clearActiveOrder, // Stable function reference (useCallback)
    ]);

    return (
        <CartContext.Provider value={contextValue}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
