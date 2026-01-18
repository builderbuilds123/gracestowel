import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useRegions, type MedusaRegion } from '../hooks/useRegions';

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

// Storage keys
const REGION_STORAGE_KEY = 'medusa_region_id';
const LANGUAGE_STORAGE_KEY = 'locale_language';

export type Language = 'en' | 'fr';
export type Currency = string; // Now dynamic based on region

interface LocaleContextType {
    language: Language;
    currency: Currency;
    regionId: string | null;
    region: MedusaRegion | null;
    regions: MedusaRegion[];
    isLoadingRegions: boolean;
    setLanguage: (lang: Language) => void;
    setRegionId: (id: string) => void;
    /** @deprecated Use setRegionId instead - currency is derived from region */
    setCurrency: (curr: Currency) => void;
    t: (key: string) => string;
    formatPrice: (price: string | number) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
    en: {
        "nav.home": "Home",
        "nav.shop": "Shop",
        "nav.about": "About",
        "cart.title": "Your Towel Rack",
        "cart.empty": "Your towel rack is empty",
        "cart.subtotal": "Subtotal",
        "cart.checkout": "Checkout",
        "product.add": "Hang it Up",
        "product.details": "Details",
        "product.care": "Care",
        "product.dimensions": "Dimensions",
        "product.completeSet": "Complete the Set",
        "footer.newsletter": "Stay in Touch",
        "footer.subscribe": "Subscribe",
    },
    fr: {
        "nav.home": "Accueil",
        "nav.shop": "Boutique",
        "nav.about": "À Propos",
        "cart.title": "Votre Porte-Serviettes",
        "cart.empty": "Votre porte-serviettes est vide",
        "cart.subtotal": "Sous-total",
        "cart.checkout": "Payer",
        "product.add": "Ajouter",
        "product.details": "Détails",
        "product.care": "Entretien",
        "product.dimensions": "Dimensions",
        "product.completeSet": "Compléter l'ensemble",
        "footer.newsletter": "Restez en contact",
        "footer.subscribe": "S'abonner",
    }
};

/**
 * Get initial value from localStorage (client-side only)
 */
function getStoredValue<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    // Language state with persistence
    const [language, setLanguageState] = useState<Language>(() => 
        getStoredValue<Language>(LANGUAGE_STORAGE_KEY, 'en')
    );

    // Region state with persistence
    const [regionId, setRegionIdState] = useState<string | null>(() => 
        getStoredValue<string | null>(REGION_STORAGE_KEY, null)
    );

    // Fetch regions from Medusa
    const { regions, isLoading: isLoadingRegions, getRegionById, getRegionByCurrency } = useRegions();

    // Derive current region from regionId
    const region = useMemo(() => {
        if (!regionId || regions.length === 0) return null;
        return getRegionById(regionId) || null;
    }, [regionId, regions, getRegionById]);

    // Derive currency from region (fallback to CAD)
    const currency = useMemo(() => {
        return region?.currency_code?.toUpperCase() || 'CAD';
    }, [region]);

    // Initialize regionId when regions load (if not already set)
    useEffect(() => {
        if (regions.length === 0) return;
        
        // If no region selected, pick default (first CAD region, or first available)
        if (!regionId) {
            const defaultRegion = getRegionByCurrency('cad') || regions[0];
            if (defaultRegion) {
                if (isDevelopment) {
                    console.log('[LocaleContext] Setting default region:', {
                        id: defaultRegion.id,
                        name: defaultRegion.name,
                        currency: defaultRegion.currency_code,
                    });
                }
                setRegionIdState(defaultRegion.id);
            }
        } else {
            // Validate stored regionId still exists
            const storedRegion = getRegionById(regionId);
            if (!storedRegion) {
                if (isDevelopment) {
                    console.log('[LocaleContext] Stored regionId invalid, resetting to default');
                }
                const defaultRegion = getRegionByCurrency('cad') || regions[0];
                if (defaultRegion) {
                    setRegionIdState(defaultRegion.id);
                }
            }
        }
    }, [regions, regionId, getRegionById, getRegionByCurrency]);

    // Persist regionId to localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (regionId) {
            localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(regionId));
            if (isDevelopment) {
                console.log('[LocaleContext] Persisted regionId:', regionId);
            }
        }
    }, [regionId]);

    // Persist language to localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(language));
    }, [language]);

    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
    }, []);

    const setRegionId = useCallback((id: string) => {
        if (isDevelopment) {
            console.log('[LocaleContext] Setting regionId:', id);
        }
        setRegionIdState(id);
    }, []);

    // Legacy setCurrency - find region by currency and set it
    const setCurrency = useCallback((curr: Currency) => {
        if (isDevelopment) {
            console.warn('[LocaleContext] setCurrency is deprecated, use setRegionId. Finding region for currency:', curr);
        }
        const matchingRegion = getRegionByCurrency(curr.toLowerCase());
        if (matchingRegion) {
            setRegionIdState(matchingRegion.id);
        }
    }, [getRegionByCurrency]);

    const t = useCallback((key: string): string => {
        return translations[language][key] || key;
    }, [language]);

    const formatPrice = useCallback((price: string | number): string => {
        let numericPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : price;
        
        if (isNaN(numericPrice)) return typeof price === 'string' ? price : '0.00';

        const localeString = language === 'fr'
            ? 'fr-CA'
            : `en-${currency === 'CAD' ? 'CA' : 'US'}`;

        return new Intl.NumberFormat(localeString, {
            style: 'currency',
            currency: currency,
        }).format(numericPrice);
    }, [language, currency]);

    const value = useMemo(() => ({
        language,
        currency,
        regionId,
        region,
        regions,
        isLoadingRegions,
        setLanguage,
        setRegionId,
        setCurrency,
        t,
        formatPrice,
    }), [
        language,
        currency,
        regionId,
        region,
        regions,
        isLoadingRegions,
        setLanguage,
        setRegionId,
        setCurrency,
        t,
        formatPrice,
    ]);

    return (
        <LocaleContext.Provider value={value}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale() {
    const context = useContext(LocaleContext);
    if (context === undefined) {
        throw new Error('useLocale must be used within a LocaleProvider');
    }
    return context;
}
