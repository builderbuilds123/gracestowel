import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  className?: string;
  showSolidHeader?: boolean;
}

export function SearchBar({ className = "", showSolidHeader = true }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery("");
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`p-2 hover:text-accent-earthy transition-colors ${className}`}
        aria-label="Open search"
      >
        <Search className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className={`w-40 md:w-56 px-3 py-1.5 pr-8 text-sm rounded-lg border transition-all
            ${showSolidHeader 
              ? 'bg-white border-card-earthy/30 text-text-earthy placeholder:text-text-earthy/50 focus:border-accent-earthy' 
              : 'bg-white/10 border-white/30 text-white placeholder:text-white/70 focus:border-white'
            }
            focus:outline-none focus:ring-2 focus:ring-accent-earthy/20`}
        />
        <button
          type="submit"
          className={`absolute right-2 top-1/2 -translate-y-1/2 ${showSolidHeader ? 'text-text-earthy/60' : 'text-white/70'}`}
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      </form>
      <button
        onClick={handleClose}
        className={`p-1 hover:text-accent-earthy transition-colors ${className}`}
        aria-label="Close search"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

