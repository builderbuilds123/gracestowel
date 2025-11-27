import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { productList } from '../data/products';
import { parsePrice, calculateTotal } from '../lib/price';
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

    // Free gift configuration - could be moved to site config later
    const FREE_GIFT_CONFIG = {
        legacyId: 4 as ProductId,
        handle: "the-wool-dryer-ball" as ProductId,
        threshold: 35,
        giftColor: "Free Gift",
    };

    // Helper to check if an item is the free gift
    const isFreeGiftItem = useCallback((item: CartItem): boolean => {
        return (
            (productIdsEqual(item.id, FREE_GIFT_CONFIG.legacyId) ||
             productIdsEqual(item.id, FREE_GIFT_CONFIG.handle)) &&
            item.color === FREE_GIFT_CONFIG.giftColor
        );
    }, []);

    // Auto-add Free Wool Dryer Ball
    useEffect(() => {
        const { legacyId, threshold, giftColor } = FREE_GIFT_CONFIG;

        // Get product info from centralized data (fallback for static products)
        const giftProduct = productList.find(p => p.id === legacyId);
        if (!giftProduct) return;

        // Calculate total excluding the free gift using the new price utility
        const qualifyingItems = items.filter(item => !isFreeGiftItem(item));
        const qualifyingTotal = calculateTotal(qualifyingItems);

        const hasFreeGift = items.some(isFreeGiftItem);

        if (qualifyingTotal >= threshold && !hasFreeGift) {
            addToCart({
                id: legacyId,
                title: giftProduct.title,
                price: "$0.00",
                originalPrice: giftProduct.formattedPrice,
                image: giftProduct.images[0],
                quantity: 1,
                color: giftColor,
                embroidery: undefined
            });
        } else if (qualifyingTotal < threshold && hasFreeGift) {
            removeFromCart(legacyId, giftColor);
        }
    }, [items, isFreeGiftItem]);

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
