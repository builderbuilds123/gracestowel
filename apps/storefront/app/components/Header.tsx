import { Link, useLocation } from "react-router";
import { Menu, User, Heart } from "lucide-react";
import { Towel } from "@phosphor-icons/react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { useCustomer } from "../context/CustomerContext";
import { useWishlist } from "../context/WishlistContext";
import { Dropdown } from "./Dropdown";
import { SearchBar } from "./SearchBar";
import { useState, useEffect } from "react";
import { SITE_CONFIG } from "../config/site";

export function Header() {
    const { toggleCart, items } = useCart();
    const { language, setLanguage, currency, setCurrency } = useLocale();
    const { isAuthenticated, customer, isLoading: authLoading } = useCustomer();
    const { itemCount: wishlistCount } = useWishlist();
    const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
    const [isScrolled, setIsScrolled] = useState(false);
    const location = useLocation();
    const isHome = location.pathname === "/";

    useEffect(() => {
        const scrollThreshold = SITE_CONFIG.ui.headerScrollThreshold;
        const handleScroll = () => {
            // Change header style after scrolling past configured threshold (e.g., 80vh for hero section)
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

    return (
        <header className={`sticky top-0 z-30 border-b transition-all duration-300 ${showSolidHeader
            ? 'bg-white/95 backdrop-blur-md border-card-earthy/30'
            : 'bg-transparent border-transparent'
            }`}>
            <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between relative">

                {/* Left: Mobile Menu & Desktop Navigation */}
                <div className="flex items-center gap-4 md:gap-8">
                    <button className={`md:hidden p-2 transition-colors ${showSolidHeader ? 'text-text-earthy' : 'text-white'
                        }`}>
                        <Menu className="w-6 h-6" />
                    </button>

                    {/* Desktop Navigation */}
                    <nav className={`hidden md:flex items-center gap-8 ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}>
                        <Link to="/about" className="hover:text-accent-earthy transition-colors font-medium">About</Link>
                        <Link to="/blog" className="hover:text-accent-earthy transition-colors font-medium">Blog</Link>
                        <Link to="/towels" className="hover:text-accent-earthy transition-colors font-medium">Towels</Link>
                    </nav>
                </div>

                {/* Center: Logo */}
                <h1 className={`absolute left-1/2 -translate-x-1/2 text-2xl md:text-3xl font-bold font-sigmar tracking-wider transition-colors ${showSolidHeader ? 'text-text-earthy' : 'text-white drop-shadow-lg'
                    }`}>
                    <Link to="/" className="hover:text-accent-earthy transition-colors">
                        Grace's Towel
                    </Link>
                </h1>

                {/* Actions */}
                <div className="flex items-center gap-2 md:gap-4">
                    {/* Search */}
                    <SearchBar
                        showSolidHeader={showSolidHeader}
                        className={showSolidHeader ? 'text-text-earthy' : 'text-white'}
                    />

                    {/* Language Selector */}
                    <Dropdown
                        value={language}
                        onChange={(val) => setLanguage(val as 'en' | 'fr')}
                        options={[
                            { label: 'EN', value: 'en' },
                            { label: 'FR', value: 'fr' },
                        ]}
                        className={showSolidHeader ? 'text-text-earthy' : 'text-white'}
                    />

                    {/* Currency Selector */}
                    <Dropdown
                        value={currency}
                        onChange={(val) => setCurrency(val as 'CAD' | 'USD')}
                        options={[
                            { label: '$ CAD', value: 'CAD' },
                            { label: '$ USD', value: 'USD' },
                        ]}
                        className={showSolidHeader ? 'text-text-earthy' : 'text-white'}
                    />

                    {/* Wishlist Link */}
                    <Link
                        to="/wishlist"
                        className={`p-2 hover:text-accent-earthy transition-colors relative ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                        title="Wishlist"
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
                            className={`p-2 hover:text-accent-earthy transition-colors relative ${showSolidHeader ? 'text-text-earthy' : 'text-white'}`}
                            title={isAuthenticated ? `Hi, ${customer?.first_name || 'Account'}` : 'Sign In'}
                        >
                            <User className="w-5 h-5" />
                            {isAuthenticated && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                            )}
                        </Link>
                    )}

                    <button
                        onClick={toggleCart}
                        className={`p-2 hover:text-accent-earthy transition-colors relative cursor-pointer ${showSolidHeader ? 'text-text-earthy' : 'text-white'
                            }`}
                    >
                        <Towel size={20} weight="regular" />
                        {itemCount > 0 && (
                            <span className="absolute top-0 right-0 bg-accent-earthy text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {itemCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
}
