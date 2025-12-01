import React, { createContext, useContext, useState, useEffect } from 'react';
import { productList } from '../data/products';

export interface CartItem {
    id: string | number;           // Product ID (Medusa string or legacy number)
    variantId?: string;            // Medusa variant ID for order creation
    title: string;
    price: string;
    originalPrice?: string;
    image: string;
    quantity: number;
    color?: string;
    sku?: string;                  // SKU for inventory tracking
    embroidery?: {
        type: 'text' | 'drawing';
        data: string;
        font?: string;
        color: string;
    };
}

interface CartContextType {
    items: CartItem[];
    isOpen: boolean;
    addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
    removeFromCart: (id: string | number, color?: string) => void;
    updateQuantity: (id: string | number, quantity: number) => void;
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

    // Auto-add Free Wool Dryer Ball
    useEffect(() => {
        const giftLegacyId = 4;
        const giftHandle = "the-wool-dryer-ball";
        const giftThreshold = 35;
        const giftColor = "Free Gift";

        // Get product info from centralized data (fallback for static products)
        const giftProduct = productList.find(p => p.id === giftLegacyId);
        if (!giftProduct) return;

        // Calculate total excluding the free gift
        // Check both legacy numeric ID and handle-based matching
        const qualifyingTotal = items.reduce((total, item) => {
            const isGift = (item.id === giftLegacyId || item.id === giftHandle) && item.color === giftColor;
            if (isGift) return total;
            const price = parseFloat(item.price.replace('$', ''));
            return total + price * item.quantity;
        }, 0);

        const hasFreeGift = items.some(item =>
            (item.id === giftLegacyId || item.id === giftHandle) && item.color === giftColor
        );

        if (qualifyingTotal >= giftThreshold && !hasFreeGift) {
            addToCart({
                id: giftLegacyId,
                title: giftProduct.title,
                price: "$0.00",
                originalPrice: giftProduct.formattedPrice,
                image: giftProduct.images[0],
                quantity: 1,
                color: giftColor,
                embroidery: undefined
            });
        } else if (qualifyingTotal < giftThreshold && hasFreeGift) {
            removeFromCart(giftLegacyId, giftColor);
        }
    }, [items]);

    const addToCart = (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
        setItems(prevItems => {
            const quantityToAdd = newItem.quantity || 1;
            const existingItem = prevItems.find(item => item.id === newItem.id && item.color === newItem.color);
            if (existingItem) {
                return prevItems.map(item =>
                    item.id === newItem.id && item.color === newItem.color
                        ? { ...item, quantity: item.quantity + quantityToAdd }
                        : item
                );
            }
            return [...prevItems, { ...newItem, quantity: quantityToAdd }];
        });
        setIsOpen(true);
    };

    const removeFromCart = (id: number, color?: string) => {
        setItems(prevItems => prevItems.filter(item => {
            if (color !== undefined) {
                return !(item.id === id && item.color === color);
            }
            return item.id !== id;
        }));
    };

    const updateQuantity = (id: number, quantity: number) => {
        if (quantity < 1) {
            removeFromCart(id);
            return;
        }
        setItems(prevItems =>
            prevItems.map(item =>
                item.id === id ? { ...item, quantity } : item
            )
        );
    };

    const toggleCart = () => setIsOpen(prev => !prev);

    const clearCart = () => {
        setItems([]);
        setIsOpen(false);
    };

    const cartTotal = items.reduce((total, item) => {
        const price = parseFloat(item.price.replace('$', ''));
        return total + price * item.quantity;
    }, 0);

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
