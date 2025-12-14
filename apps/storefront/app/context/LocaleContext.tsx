import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'fr';
export type Currency = 'CAD' | 'USD';

interface LocaleContextType {
    language: Language;
    currency: Currency;
    setLanguage: (lang: Language) => void;
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

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>('en');
    const [currency, setCurrency] = useState<Currency>('CAD');

    const t = (key: string): string => {
        return translations[language][key] || key;
    };

    const formatPrice = (price: string | number): string => {
        let numericPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : price;
        
        if (isNaN(numericPrice)) return typeof price === 'string' ? price : '0.00';

        return new Intl.NumberFormat(language === 'fr' ? 'fr-CA' : 'en-US', {
            style: 'currency',
            currency: currency,
        }).format(numericPrice);
    };

    return (
        <LocaleContext.Provider value={{ language, currency, setLanguage, setCurrency, t, formatPrice }}>
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
