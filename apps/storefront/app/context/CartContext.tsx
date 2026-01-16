import React, { createContext, useContext, useState, useEffect } from 'react';
import { calculateTotal } from '../lib/price';
import type { ProductId, CartItem, EmbroideryData } from '../types/product';
import { productIdsEqual } from '../types/product';

// Re-export CartItem for backwards compatibility
export type { CartItem, EmbroideryData } from '../types/product';

interface CartContextType {
    items: CartItem[];
    isOpen: boolean;
    isLoaded: boolean;
    addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
    removeFromCart: (id: ProductId, color?: string) => void;
    updateQuantity: (id: ProductId, quantity: number, color?: string, variantId?: string) => void;
    toggleCart: () => void;
    clearCart: () => void;
    cartTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Validate cart item integrity
    const validateCartItem = (item: any): boolean => {
        if (!item.id) return false;
        if (!item.title || typeof item.title !== 'string') return false;
        if (!item.price || typeof item.price !== 'string') return false;
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

    // Save cart to local storage whenever it changes
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(items));
    }, [items]);

    const addToCart = (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
        // Fail loudly if inputs are invalid (User Requirement)
        if (!validateCartItem(newItem)) {
            const error = `Attempted to add invalid item to cart: ${JSON.stringify(newItem)}`;
            console.error(error);
            throw new Error(error);
        }

        setItems(prevItems => {
            const quantityToAdd = newItem.quantity || 1;
            const existingItem = prevItems.find(item =>
                productIdsEqual(item.id, newItem.id) && item.color === newItem.color
            );
            if (existingItem) {
                return prevItems.map(item =>
                    productIdsEqual(item.id, newItem.id) && item.color === newItem.color
                        ? { ...item, quantity: item.quantity + quantityToAdd }
                        : item
                );
            }
            return [...prevItems, { ...newItem, quantity: quantityToAdd }];
        });
        setIsOpen(true);
    };

    const removeFromCart = (id: ProductId, color?: string) => {
        setItems(prevItems => prevItems.filter(item => {
            if (color !== undefined) {
                return !(productIdsEqual(item.id, id) && item.color === color);
            }
            return !productIdsEqual(item.id, id);
        }));
    };

    const updateQuantity = (id: ProductId, quantity: number, color?: string, variantId?: string) => {
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
    const cartTotal = calculateTotal(items);

    return (
        <CartContext.Provider value={{ items, isOpen, isLoaded, addToCart, removeFromCart, updateQuantity, toggleCart, clearCart, cartTotal }}>
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
