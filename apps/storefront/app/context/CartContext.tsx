import React, { createContext, useContext, useState, useEffect } from 'react';
import { calculateTotal } from '../lib/price';
import type { ProductId, CartItem, EmbroideryData } from '../types/product';
import { productIdsEqual } from '../types/product';
import { monitoredFetch } from '../utils/monitored-fetch';
import { useMedusaCart } from './MedusaCartContext';
import { useLocale } from './LocaleContext';

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
    medusaCart?: any | null;
    isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const cartCreateInFlight = React.useRef(false);
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

        const timeoutId = setTimeout(async () => {
            try {
                const response = await monitoredFetch(`/api/carts/${cartId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                    label: 'sync-cart-items-debounced',
                });
                if (response.ok) {
                    void refreshCart();
                }
            } catch (err) {
                console.error('[CartContext] Failed to sync items with Medusa:', err);
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timeoutId);
    }, [items, cartId, isLoaded]);

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
        if (typeof window !== 'undefined' && !cartCreateInFlight.current) {
            void (async () => {
                try {
                    if (cartId) {
                        return;
                    }
                    cartCreateInFlight.current = true;
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
    // Prefer Medusa subtotal for the main cart total display if available
    const displayCartTotal = medusaCart?.subtotal ?? calculateTotal(items);

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
            isLoading
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
