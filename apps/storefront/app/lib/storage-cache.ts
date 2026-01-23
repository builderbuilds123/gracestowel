/**
 * Cached storage utility for localStorage/sessionStorage
 * 
 * Implements in-memory caching to avoid repeated synchronous I/O operations.
 * Cache is invalidated on external changes (e.g., from other tabs).
 * 
 * Issue #17: Missing localStorage Read Caching
 * From Vercel Engineering: "localStorage, sessionStorage, and document.cookie 
 * are synchronous and expensive. Cache reads in memory."
 */

const storageCache = new Map<string, string | null>();
const sessionStorageCache = new Map<string, string | null>();

/**
 * Get a value from localStorage with in-memory caching
 * @param key - Storage key
 * @returns Cached value or null
 */
export function getCachedStorage(key: string): string | null {
    if (!storageCache.has(key)) {
        try {
            storageCache.set(key, localStorage.getItem(key));
        } catch (e) {
            // Handle quota exceeded or other errors
            storageCache.set(key, null);
        }
    }
    return storageCache.get(key) ?? null;
}

/**
 * Set a value in localStorage and update cache
 * @param key - Storage key
 * @param value - Value to store
 */
export function setCachedStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
        storageCache.set(key, value);
    } catch (e) {
        // Handle quota exceeded or other errors
        // Note: Using console.error here as this is a utility module without logger dependency
        // In production, these errors are rare and acceptable to log to console
        if (import.meta.env.MODE !== 'production') {
            console.error('[Storage] Failed to save:', e);
        }
        storageCache.delete(key); // Invalidate cache on error
    }
}

/**
 * Remove a value from localStorage and cache
 * @param key - Storage key
 */
export function removeCachedStorage(key: string): void {
    try {
        localStorage.removeItem(key);
        storageCache.delete(key);
    } catch (e) {
        // Note: Using console.error here as this is a utility module without logger dependency
        // In production, these errors are rare and acceptable to log to console
        if (import.meta.env.MODE !== 'production') {
            console.error('[Storage] Failed to remove:', e);
        }
    }
}

/**
 * Get a value from sessionStorage with in-memory caching (Issue #32)
 * @param key - Storage key
 * @returns Cached value or null
 */
export function getCachedSessionStorage(key: string): string | null {
    if (!sessionStorageCache.has(key)) {
        try {
            sessionStorageCache.set(key, sessionStorage.getItem(key));
        } catch (e) {
            // Handle quota exceeded or other errors
            sessionStorageCache.set(key, null);
        }
    }
    return sessionStorageCache.get(key) ?? null;
}

/**
 * Set a value in sessionStorage and update cache (Issue #32)
 * @param key - Storage key
 * @param value - Value to store
 */
export function setCachedSessionStorage(key: string, value: string): void {
    try {
        sessionStorage.setItem(key, value);
        sessionStorageCache.set(key, value);
    } catch (e) {
        // Handle quota exceeded or other errors
        if (import.meta.env.MODE !== 'production') {
            console.error('[Storage] Failed to save to sessionStorage:', e);
        }
        sessionStorageCache.delete(key); // Invalidate cache on error
    }
}

/**
 * Remove a value from sessionStorage and cache (Issue #32)
 * @param key - Storage key
 */
export function removeCachedSessionStorage(key: string): void {
    try {
        sessionStorage.removeItem(key);
        sessionStorageCache.delete(key);
    } catch (e) {
        if (import.meta.env.MODE !== 'production') {
            console.error('[Storage] Failed to remove from sessionStorage:', e);
        }
    }
}

/**
 * Clear cache for a specific key or all keys
 * @param key - Optional key to clear, or undefined to clear all
 */
export function clearStorageCache(key?: string): void {
    if (key) {
        storageCache.delete(key);
        sessionStorageCache.delete(key);
    } else {
        storageCache.clear();
        sessionStorageCache.clear();
    }
}

// Invalidate cache on external changes (other tabs)
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key) {
            storageCache.delete(e.key);
            sessionStorageCache.delete(e.key);
        } else {
            // If key is null, all storage was cleared
            storageCache.clear();
            sessionStorageCache.clear();
        }
    });
}
