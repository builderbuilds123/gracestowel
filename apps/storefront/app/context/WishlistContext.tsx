import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getCachedStorage, setCachedStorage } from "../lib/storage-cache";
import { createLogger } from "../lib/logger";

export interface WishlistItem {
    id: string;
    handle: string;
    title: string;
    price: string;
    image: string;
    addedAt: string;
}

interface WishlistContextType {
    items: WishlistItem[];
    addItem: (item: Omit<WishlistItem, "addedAt">) => void;
    removeItem: (id: string) => void;
    isInWishlist: (id: string) => boolean;
    toggleItem: (item: Omit<WishlistItem, "addedAt">) => void;
    clearWishlist: () => void;
    itemCount: number;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const WISHLIST_STORAGE_KEY = "grace-stowel-wishlist";

export function WishlistProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load from localStorage on mount (client-side only) (Issue #24: Use cached storage)
    useEffect(() => {
        try {
            const stored = getCachedStorage(WISHLIST_STORAGE_KEY); // Cached read
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setItems(parsed);
                }
            }
        } catch (error) {
            const logger = createLogger({ context: "WishlistContext" });
            logger.error("Failed to load wishlist from localStorage", error instanceof Error ? error : new Error(String(error)));
        }
        setIsHydrated(true);
    }, []);

    // Persist to localStorage when items change (Issue #24: Use cached storage)
    useEffect(() => {
        if (isHydrated) {
            try {
                setCachedStorage(WISHLIST_STORAGE_KEY, JSON.stringify(items)); // Cached write
            } catch (error) {
                const logger = createLogger({ context: "WishlistContext" });
                logger.error("Failed to save wishlist to localStorage", error instanceof Error ? error : new Error(String(error)));
            }
        }
    }, [items, isHydrated]);

    const addItem = (item: Omit<WishlistItem, "addedAt">) => {
        setItems((prev) => {
            // Don't add if already exists
            if (prev.some((i) => i.id === item.id)) {
                return prev;
            }
            return [...prev, { ...item, addedAt: new Date().toISOString() }];
        });
    };

    const removeItem = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    };

    const isInWishlist = (id: string) => {
        return items.some((item) => item.id === id);
    };

    const toggleItem = (item: Omit<WishlistItem, "addedAt">) => {
        if (isInWishlist(item.id)) {
            removeItem(item.id);
        } else {
            addItem(item);
        }
    };

    const clearWishlist = () => {
        setItems([]);
    };

    return (
        <WishlistContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                isInWishlist,
                toggleItem,
                clearWishlist,
                itemCount: items.length,
            }}
        >
            {children}
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (!context) {
        throw new Error("useWishlist must be used within a WishlistProvider");
    }
    return context;
}

