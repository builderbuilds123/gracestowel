/**
 * SEC-05: Storage Migration Utilities
 * Handles migration of checkout data from localStorage to sessionStorage
 * with comprehensive error handling and fallback behavior
 */
import { createLogger } from "./logger";

/**
 * Migrate a storage item from localStorage to sessionStorage
 * @param key - Storage key to migrate
 * @param logger - Logger instance for error reporting
 * @returns The migrated value (from sessionStorage or localStorage fallback), or null if unavailable
 */
export function migrateStorageItem(
    key: string,
    logger: ReturnType<typeof createLogger>
): string | null {
    let sessionValue: string | null = null;

    // Try to read from sessionStorage first
    try {
        sessionValue = sessionStorage.getItem(key);
    } catch (error) {
        // sessionStorage may be disabled (private browsing, storage disabled)
        logger.warn("sessionStorage access failed during migration", {
            key,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    // If already in sessionStorage, clean up localStorage copy
    if (sessionValue) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            // Non-critical: localStorage cleanup failure
            logger.warn("Failed to cleanup legacy localStorage item", {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return sessionValue;
    }

    // Migration path: check localStorage for legacy data
    try {
        const legacyValue = localStorage.getItem(key);
        if (legacyValue) {
            // Try to migrate to sessionStorage
            try {
                sessionStorage.setItem(key, legacyValue);
                localStorage.removeItem(key);
                return legacyValue;
            } catch (error) {
                // Migration failed (sessionStorage full or disabled)
                // Use localStorage value as fallback
                logger.warn("Failed to migrate item to sessionStorage, using localStorage fallback", {
                    key,
                    error: error instanceof Error ? error.message : String(error),
                });
                return legacyValue;
            }
        }
    } catch (error) {
        // localStorage access failed - continue without saved value
        logger.warn("localStorage access failed during migration", {
            key,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return null;
}

