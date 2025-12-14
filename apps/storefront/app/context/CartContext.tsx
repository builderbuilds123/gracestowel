import React, { createContext, useContext, useState, useEffect } from 'react';
import { calculateTotal } from '../lib/price';
import type { ProductId, CartItem, EmbroideryData } from '../types/product';
import { productIdsEqual } from '../types/product';

// Re-export CartItem for backwards compatibility
export type { CartItem, EmbroideryData } from '../types/product';

interface CartContextType {
    items: CartItem[];
    isOpen: boolean;
    addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
    removeFromCart: (id: ProductId, color?: string) => void;
    updateQuantity: (id: ProductId, quantity: number) => void;
    toggleCart: () => void;
    clearCart: () => void;
    cartTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    // Load cart from local storage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            setItems(JSON.parse(savedCart));
        }
    }, []);

    // Save cart to local storage whenever it changes
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(items));
    }, [items]);

    const addToCart = (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
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

    const updateQuantity = (id: ProductId, quantity: number) => {
        if (quantity < 1) {
            removeFromCart(id);
            return;
        }
        setItems(prevItems =>
            prevItems.map(item =>
                productIdsEqual(item.id, id) ? { ...item, quantity } : item
            )
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
        <CartContext.Provider value={{ items, isOpen, addToCart, removeFromCart, updateQuantity, toggleCart, clearCart, cartTotal }}>
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
