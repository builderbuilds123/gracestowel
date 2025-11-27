import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

interface FilterOption {
    value: string;
    label: string;
    count?: number;
}

interface ProductFiltersProps {
    colors: FilterOption[];
    selectedColors: string[];
    onColorChange: (colors: string[]) => void;
    priceRange: { min: number; max: number };
    selectedPriceRange: { min: number; max: number };
    onPriceChange: (range: { min: number; max: number }) => void;
    onClearFilters: () => void;
}

export function ProductFilters({
    colors,
    selectedColors,
    onColorChange,
    priceRange,
    selectedPriceRange,
    onPriceChange,
    onClearFilters,
}: ProductFiltersProps) {
    const [showColors, setShowColors] = useState(true);
    const [showPrice, setShowPrice] = useState(true);

    const hasActiveFilters = selectedColors.length > 0 || 
        selectedPriceRange.min > priceRange.min || 
        selectedPriceRange.max < priceRange.max;

    const toggleColor = (color: string) => {
        if (selectedColors.includes(color)) {
            onColorChange(selectedColors.filter(c => c !== color));
        } else {
            onColorChange([...selectedColors, color]);
        }
    };

    return (
        <div className="w-full md:w-64 shrink-0">
            <div className="bg-white rounded-lg border border-card-earthy/20 p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-text-earthy">Filters</h3>
                    {hasActiveFilters && (
                        <button
                            onClick={onClearFilters}
                            className="text-sm text-accent-earthy hover:underline flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Color Filter */}
                <div className="border-t border-card-earthy/10 pt-4">
                    <button
                        onClick={() => setShowColors(!showColors)}
                        className="w-full flex items-center justify-between text-sm font-medium text-text-earthy mb-3"
                    >
                        Color
                        <ChevronDown className={`w-4 h-4 transition-transform ${showColors ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showColors && (
                        <div className="space-y-2">
                            {colors.map((color) => (
                                <label key={color.value} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={selectedColors.includes(color.value)}
                                        onChange={() => toggleColor(color.value)}
                                        className="w-4 h-4 rounded border-card-earthy/30 text-accent-earthy 
                                            focus:ring-accent-earthy/20"
                                    />
                                    <span className="text-sm text-text-earthy/80 group-hover:text-text-earthy">
                                        {color.label}
                                    </span>
                                    {color.count !== undefined && (
                                        <span className="text-xs text-text-earthy/50">({color.count})</span>
                                    )}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Price Range Filter */}
                <div className="border-t border-card-earthy/10 pt-4 mt-4">
                    <button
                        onClick={() => setShowPrice(!showPrice)}
                        className="w-full flex items-center justify-between text-sm font-medium text-text-earthy mb-3"
                    >
                        Price Range
                        <ChevronDown className={`w-4 h-4 transition-transform ${showPrice ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showPrice && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-text-earthy/60 mb-1 block">Min</label>
                                    <input
                                        type="number"
                                        min={priceRange.min}
                                        max={selectedPriceRange.max}
                                        value={selectedPriceRange.min}
                                        onChange={(e) => onPriceChange({ 
                                            ...selectedPriceRange, 
                                            min: Math.max(priceRange.min, Number(e.target.value)) 
                                        })}
                                        className="w-full px-2 py-1.5 text-sm rounded border border-card-earthy/30 
                                            focus:outline-none focus:border-accent-earthy"
                                    />
                                </div>
                                <span className="text-text-earthy/40 pt-5">—</span>
                                <div className="flex-1">
                                    <label className="text-xs text-text-earthy/60 mb-1 block">Max</label>
                                    <input
                                        type="number"
                                        min={selectedPriceRange.min}
                                        max={priceRange.max}
                                        value={selectedPriceRange.max}
                                        onChange={(e) => onPriceChange({ 
                                            ...selectedPriceRange, 
                                            max: Math.min(priceRange.max, Number(e.target.value)) 
                                        })}
                                        className="w-full px-2 py-1.5 text-sm rounded border border-card-earthy/30 
                                            focus:outline-none focus:border-accent-earthy"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-text-earthy/50">
                                ${selectedPriceRange.min} — ${selectedPriceRange.max}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

