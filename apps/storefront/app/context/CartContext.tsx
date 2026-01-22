import React, { createContext, useContext, useState, useEffect } from 'react';
import { calculateTotal, fromCents } from '../lib/price';
import type { ProductId, CartItem, EmbroideryData } from '../types/product';
import { productIdsEqual } from '../types/product';
import { monitoredFetch } from '../utils/monitored-fetch';
import { useMedusaCart } from './MedusaCartContext';
import { useLocale } from './LocaleContext';
import type { CartWithPromotions } from '../types/promotion';

// Re-export CartItem for backwards compatibility
export type { CartItem, EmbroideryData } from '../types/product';

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
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const cartCreateInFlight = React.useRef(false);
    const lastSyncRequestId = React.useRef(0);
    const { cartId, cart: medusaCart, setCartId, isLoading, refreshCart } = useMedusaCart();
    const { regionId } = useLocale();

    // Validate cart item integrity
    const validateCartItem = (item: any): boolean => {
        if (!item.id) return false;
        if (!item.title || typeof item.title !== 'string') return false;
        if (!item.price || typeof item.price !== 'string') return false;
        if (typeof item.quantity !== 'number' || item.quantity <= 0) return false;
        return true;
    };

    // Load cart from local storage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed)) {
                    const validItems = parsed.filter(validateCartItem);
                    if (validItems.length !== parsed.length) {
                        console.warn("[CartContext] Purged invalid items from local storage:", 
                            parsed.length - validItems.length, "items removed");
                    }
                    setItems(validItems);
                }
            } catch (e) {
                console.error("[CartContext] Failed to parse cart from local storage", e);
                // If corrupted, clear it to self-heal
                localStorage.removeItem('cart');
            }
        }
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(items));
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
                    console.error('[CartContext] Sync failed:', errorPayload);
                    await refreshCart();
                }
            } catch (err) {
                console.error('[CartContext] Failed to sync items with Medusa:', err);
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

    const addToCart = (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
        const quantityToAdd = newItem.quantity ?? 1;
        const itemToAdd = { ...newItem, quantity: quantityToAdd };
        // Fail loudly if inputs are invalid (User Requirement)
        if (!validateCartItem(itemToAdd)) {
            const error = `Attempted to add invalid item to cart: ${JSON.stringify(itemToAdd)}`;
            console.error(error);
            throw new Error(error);
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
    };

    const removeFromCart = (id: ProductId, color?: string, variantId?: string) => {
        setItems(prevItems => prevItems.filter(item => {
            if (variantId) {
                return item.variantId !== variantId;
            }
            if (color !== undefined) {
                return !(productIdsEqual(item.id, id) && item.color === color && !item.variantId);
            }
            return !(productIdsEqual(item.id, id) && !item.variantId);
        }));
    };

    const updateQuantity = (id: ProductId, quantity: number, color?: string, variantId?: string) => {
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
    };

    const toggleCart = () => setIsOpen(prev => !prev);

    const clearCart = () => {
        setItems([]);
        setIsOpen(false);
    };

    // Use the centralized price calculation utility
    // Optimistic calculation: Apply previous discount ratio to current local items
    // to prevent the "jump up" UI flicker while syncing (Story 5.4 optimization)
    const displayCartTotal = React.useMemo(() => {
        const localSubtotal = calculateTotal(items);
        
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
    }, [items, medusaCart, isSyncing]);

    return (
        <CartContext.Provider value={{ 
            items, 
            isOpen, 
            isLoaded, 
            addToCart, 
            removeFromCart, 
            updateQuantity, 
            toggleCart, 
            clearCart, 
            cartTotal: displayCartTotal,
            medusaCart,
            isLoading,
            isSyncing
        }}>
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
