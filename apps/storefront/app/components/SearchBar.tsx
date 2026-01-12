import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Search, X } from "lucide-react";

interface SearchBarProps {
    className?: string;
    showSolidHeader?: boolean;
    /** Auto-focus input on mount */
    autoFocus?: boolean;
    /** Callback when search is closed */
    onClose?: () => void;
    /** Full width mode (for overlay search) */
    fullWidth?: boolean;
}

export function SearchBar({
    className = "",
    showSolidHeader = true,
    autoFocus = false,
    onClose,
    fullWidth = false
}: SearchBarProps) {
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Focus input when autoFocus is true
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setQuery("");
                onClose?.();
            }
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            setQuery("");
            onClose?.();
        }
    };

    const handleClose = () => {
        setQuery("");
        onClose?.();
    };

    return (
        <div className={`flex items-center gap-2 ${fullWidth ? 'w-full' : ''}`}>
            <form onSubmit={handleSubmit} className={`relative ${fullWidth ? 'flex-1' : ''}`}>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search products..."
                    className={`px-4 py-2.5 pr-10 text-sm rounded-lg border transition-all
                        ${fullWidth ? 'w-full' : 'w-40 md:w-56'}
                        ${showSolidHeader
                            ? 'bg-white border-card-earthy/30 text-text-earthy placeholder:text-text-earthy/50 focus:border-accent-earthy'
                            : 'bg-white/10 border-white/30 text-white placeholder:text-white/70 focus:border-white'
                        }
                        focus:outline-none focus:ring-2 focus:ring-accent-earthy/20`}
                />
                <button
                    type="submit"
                    className={`absolute right-3 top-1/2 -translate-y-1/2 ${showSolidHeader ? 'text-text-earthy/60 hover:text-accent-earthy' : 'text-white/70 hover:text-white'} transition-colors`}
                    aria-label="Search"
                >
                    <Search className="w-4 h-4" />
                </button>
            </form>
            {onClose && (
                <button
                    onClick={handleClose}
                    className={`p-2 hover:text-accent-earthy transition-colors rounded-lg hover:bg-gray-100 ${className}`}
                    aria-label="Close search"
                >
                    <X className="w-5 h-5 text-text-earthy" />
                </button>
            )}
        </div>
    );
}
