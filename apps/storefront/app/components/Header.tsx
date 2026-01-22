import { Link, useLocation } from "react-router";
import { Menu, User, Heart, X, Globe, DollarSign } from "lucide-react";
import { Towel } from "@phosphor-icons/react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { useCustomer } from "../context/CustomerContext";
import { useWishlist } from "../context/WishlistContext";
import { Dropdown } from "./Dropdown";
import { useState, useEffect, useRef } from "react";
import { SITE_CONFIG } from "../config/site";

/**
 * Responsive Header Component
 *
 * Layout Strategy:
 * - Desktop (lg+): Full navigation with all elements visible
 * - Tablet (md): Logo centered, condensed navigation
 * - Mobile: Hamburger menu, minimal header with slide-out drawer
 *
 * Key improvements:
 * - Logo uses CSS Grid instead of absolute positioning to prevent overlaps
 * - Action items are responsive - less important items hidden on smaller screens
 * - Mobile drawer for navigation and settings
 * - Search expands as overlay on mobile to prevent layout issues
 */

interface MobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    showSolidHeader: boolean;
    language: string;
    setLanguage: (lang: 'en' | 'fr') => void;
    currency: string;
    setCurrency: (currency: 'CAD' | 'USD') => void;
}

function MobileMenu({ isOpen, onClose, showSolidHeader, language, setLanguage, currency, setCurrency }: MobileMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Slide-out drawer */}
            <div
                ref={menuRef}
                className="fixed top-0 left-0 h-full w-72 max-w-[80vw] bg-white z-50 shadow-2xl lg:hidden animate-in slide-in-from-left duration-300"
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                        <span className="text-lg font-sigmar text-text-earthy">Menu</span>
                        <button
                            onClick={onClose}
                            className="p-2 text-text-earthy hover:text-accent-earthy transition-colors"
                            aria-label="Close menu"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 p-4 space-y-1">
                        <Link
                            to="/"
                            onClick={onClose}
                            className="block px-4 py-3 text-text-earthy hover:bg-accent-earthy/5 hover:text-accent-earthy rounded-lg transition-colors font-medium"
                        >
                            Home
                        </Link>
                        <Link
                            to="/about"
                            onClick={onClose}
                            className="block px-4 py-3 text-text-earthy hover:bg-accent-earthy/5 hover:text-accent-earthy rounded-lg transition-colors font-medium"
                        >
                            About
                        </Link>
                        <Link
                            to="/blog"
                            onClick={onClose}
                            className="block px-4 py-3 text-text-earthy hover:bg-accent-earthy/5 hover:text-accent-earthy rounded-lg transition-colors font-medium"
                        >
                            Blog
                        </Link>
                        <Link
                            to="/towels"
                            onClick={onClose}
                            className="block px-4 py-3 text-text-earthy hover:bg-accent-earthy/5 hover:text-accent-earthy rounded-lg transition-colors font-medium"
                        >
                            Towels
                        </Link>
                        <Link
                            to="/wishlist"
                            onClick={onClose}
                            className="block px-4 py-3 text-text-earthy hover:bg-accent-earthy/5 hover:text-accent-earthy rounded-lg transition-colors font-medium"
                        >
                            Wishlist
                        </Link>
                    </nav>

                    {/* Settings Section */}
                    <div className="p-4 border-t border-gray-100 space-y-4">
                        <div className="text-xs text-text-earthy/60 uppercase tracking-wider font-medium px-4">
                            Settings
                        </div>

                        {/* Language */}
                        <div className="flex items-center justify-between px-4">
                            <div className="flex items-center gap-2 text-text-earthy">
                                <Globe className="w-4 h-4" />
                                <span className="text-sm">Language</span>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setLanguage('en')}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                        language === 'en'
                                            ? 'bg-accent-earthy text-white'
                                            : 'bg-gray-100 text-text-earthy hover:bg-gray-200'
                                    }`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLanguage('fr')}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                        language === 'fr'
                                            ? 'bg-accent-earthy text-white'
                                            : 'bg-gray-100 text-text-earthy hover:bg-gray-200'
                                    }`}
                                >
                                    FR
                                </button>
                            </div>
                        </div>

                        {/* Currency */}
                        <div className="flex items-center justify-between px-4">
                            <div className="flex items-center gap-2 text-text-earthy">
                                <DollarSign className="w-4 h-4" />
                                <span className="text-sm">Currency</span>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setCurrency('CAD')}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                        currency === 'CAD'
                                            ? 'bg-accent-earthy text-white'
                                            : 'bg-gray-100 text-text-earthy hover:bg-gray-200'
                                    }`}
                                >
                                    CAD
                                </button>
                                <button
                                    onClick={() => setCurrency('USD')}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                        currency === 'USD'
                                            ? 'bg-accent-earthy text-white'
                                            : 'bg-gray-100 text-text-earthy hover:bg-gray-200'
                                    }`}
                                >
                                    USD
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export function Header() {
    const { toggleCart, items } = useCart();
    const { language, setLanguage, currency, setCurrency } = useLocale();
    const { isAuthenticated, customer, isLoading: authLoading } = useCustomer();
    const { itemCount: wishlistCount } = useWishlist();
    const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();
    const isHome = location.pathname === "/";

    useEffect(() => {
        const scrollThreshold = SITE_CONFIG.ui.headerScrollThreshold;
        const handleScroll = () => {
            if (window.scrollY > window.innerHeight * scrollThreshold) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const showSolidHeader = !isHome || isScrolled;

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <>
            <header className={`sticky top-0 z-30 border-b transition-all duration-300 ${showSolidHeader
                ? 'bg-white/95 backdrop-blur-md border-card-earthy/30'
                : 'bg-transparent border-transparent'
            }`}>
                {/* Main Header Bar */}
                <div className="container mx-auto px-4 h-16 lg:h-20">
                    {/*
                     * CSS Grid Layout: 3 columns
                     * - Left: Navigation (auto width)
                     * - Center: Logo (1fr - takes remaining space, centered)
                     * - Right: Actions (auto width)
                     */}
                    <div className="h-full grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 lg:gap-8">

                        {/* Left Section: Mobile Menu Button + Desktop Nav */}
                        <div className="flex items-center gap-2 lg:gap-6">
                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                className={`lg:hidden p-2 -ml-2 transition-colors ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                                aria-label="Open menu"
                            >
                                <Menu className="w-5 h-5" />
                            </button>

                            {/* Desktop Navigation - Hidden on mobile/tablet */}
                            <nav className={`hidden lg:flex items-center gap-6 ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}>
                                <Link to="/about" className="text-sm hover:text-accent-earthy transition-colors font-medium whitespace-nowrap">
                                    About
                                </Link>
                                <Link to="/blog" className="text-sm hover:text-accent-earthy transition-colors font-medium whitespace-nowrap">
                                    Blog
                                </Link>
                                <Link to="/towels" className="text-sm hover:text-accent-earthy transition-colors font-medium whitespace-nowrap">
                                    Towels
                                </Link>
                            </nav>
                        </div>

                        {/* Center Section: Logo */}
                        <div className="flex justify-center min-w-0">
                            <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold font-sigmar tracking-wider transition-colors truncate ${
                                showSolidHeader ? 'text-text-earthy' : 'text-white drop-shadow-lg'
                            }`}>
                                <Link to="/" className="hover:text-accent-earthy transition-colors">
                                    Grace's Towel
                                </Link>
                            </h1>
                        </div>

                        {/* Right Section: Actions */}
                        <div className="flex items-center gap-1 sm:gap-2 lg:gap-3">


                            {/* Language Selector - Desktop only */}
                            <div className="hidden lg:block">
                                <Dropdown
                                    value={language}
                                    onChange={(val) => setLanguage(val as 'en' | 'fr')}
                                    options={[
                                        { label: 'EN', value: 'en' },
                                        { label: 'FR', value: 'fr' },
                                    ]}
                                    className={showSolidHeader ? 'text-text-earthy' : 'text-white'}
                                />
                            </div>

                            {/* Currency Selector - Desktop only */}
                            <div className="hidden lg:block">
                                <Dropdown
                                    value={currency}
                                    onChange={(val) => setCurrency(val as 'CAD' | 'USD')}
                                    options={[
                                        { label: '$ CAD', value: 'CAD' },
                                        { label: '$ USD', value: 'USD' },
                                    ]}
                                    className={showSolidHeader ? 'text-text-earthy' : 'text-white'}
                                />
                            </div>

                            {/* Wishlist Link - Hidden on smallest screens */}
                            <Link
                                to="/wishlist"
                                className={`hidden sm:flex p-2 hover:text-accent-earthy transition-colors relative ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                                title="Wishlist"
                                aria-label="Wishlist"
                            >
                                <Heart className="w-5 h-5" />
                                {wishlistCount > 0 && (
                                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                        {wishlistCount}
                                    </span>
                                )}
                            </Link>

                            {/* Account Link */}
                            {!authLoading && (
                                <Link
                                    to={isAuthenticated ? "/account" : "/account/login"}
                                    className={`hidden sm:flex p-2 hover:text-accent-earthy transition-colors relative ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                                    title={isAuthenticated ? `Hi, ${customer?.first_name || 'Account'}` : 'Sign In'}
                                    aria-label={isAuthenticated ? "Account" : "Sign In"}
                                >
                                    <User className="w-5 h-5" />
                                    {isAuthenticated && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                                    )}
                                </Link>
                            )}

                            {/* Cart Button - Always visible */}
                            <button
                                onClick={toggleCart}
                                className={`p-2 hover:text-accent-earthy transition-colors relative cursor-pointer ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                                aria-label="Open cart"
                            >
                                <Towel size={20} weight="regular" />
                                <span 
                                    data-testid="nav-cart-count"
                                    className={`absolute top-0 right-0 bg-accent-earthy text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${itemCount === 0 ? 'hidden' : ''}`}
                                >
                                    {itemCount}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>


            </header>

            {/* Mobile Menu Drawer */}
            <MobileMenu
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
                showSolidHeader={showSolidHeader}
                language={language}
                setLanguage={setLanguage}
                currency={currency}
                setCurrency={setCurrency}
            />
        </>
    );
}
