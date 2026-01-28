import { useState, useCallback } from "react";
import { Check } from "../../lib/icons";
import { useInViewReveal } from "./hooks";

interface ColorOption {
  name: string;
  hex: string;
  mood: string;
}

interface ColorMorpherProps {
  colors: ColorOption[];
  selectedColor: string;
  onColorChange: (colorName: string) => void;
  productImage?: string;
  className?: string;
}

// Default color moods for common towel colors
const defaultColorMoods: Record<string, string> = {
  "Cloud White": "Pure and refreshing, like a crisp morning",
  "Sage": "Calm and grounding, inspired by nature",
  "Terra Cotta": "Warm and inviting, earthy elegance",
  "Charcoal": "Bold and sophisticated, modern luxury",
  "Navy": "Deep and serene, timeless classic",
  "Sand": "Soft and natural, beach-house vibes",
  "Stone": "Cool and contemporary, understated beauty",
};

/**
 * Animated color selector with mood text and visual transitions
 * Creates an emotional connection to color choice
 */
export function ColorMorpher({
  colors,
  selectedColor,
  onColorChange,
  productImage,
  className = "",
}: ColorMorpherProps) {
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const { ref: revealRef, isInView } = useInViewReveal({ threshold: 0.3 });

  const displayColor = hoveredColor || selectedColor;
  const displayColorData = colors.find((c) => c.name === displayColor);

  const handleColorSelect = useCallback((colorName: string) => {
    onColorChange(colorName);
    // Clear hover state after selection to prevent visual confusion
    setHoveredColor(null);
  }, [onColorChange]);

  return (
    <section
      ref={revealRef}
      className={`py-16 px-6 ${className}`}
      aria-label="Color selection"
    >
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div
          className={`text-center mb-10 transition-all duration-700 ${
            isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-3">
            Your Color, Your Vibe
          </h2>
          <p className="text-text-earthy/60">
            Each shade tells a different story
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Color preview - shows product in selected color */}
          {productImage ? (
            <div
              className={`relative aspect-square rounded-3xl overflow-hidden shadow-soft-lg transition-all duration-700 ${
                isInView ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              <img
                src={productImage}
                alt={`Towel in ${displayColor}`}
                className="w-full h-full object-cover transition-all duration-500"
                style={{
                  filter: displayColorData
                    ? `saturate(1.1) hue-rotate(${getHueRotation(displayColorData.hex)}deg)`
                    : "none",
                }}
              />
              {/* Color overlay effect */}
              <div
                className="absolute inset-0 mix-blend-color opacity-20 transition-colors duration-500"
                style={{ backgroundColor: displayColorData?.hex || "transparent" }}
              />
            </div>
          ) : null}

          {/* Color selection area */}
          <div className="space-y-8">
            {/* Color swatches */}
            <div
              className={`transition-all duration-700 ${
                isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                {colors.map((color, index) => (
                  <button
                    key={color.name}
                    onClick={() => handleColorSelect(color.name)}
                    onTouchEnd={(e) => {
                      // On touch devices, select immediately on tap
                      // Prevent the subsequent click event to avoid double-firing
                      e.preventDefault();
                      handleColorSelect(color.name);
                    }}
                    onMouseEnter={() => setHoveredColor(color.name)}
                    onMouseLeave={() => setHoveredColor(null)}
                    onFocus={() => setHoveredColor(color.name)}
                    onBlur={() => setHoveredColor(null)}
                    className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-earthy touch-target ${
                      isInView ? "opacity-100 scale-100" : "opacity-0 scale-0"
                    } ${
                      selectedColor === color.name
                        ? "ring-2 ring-text-earthy ring-offset-2 scale-110"
                        : "hover:scale-110"
                    }`}
                    style={{
                      backgroundColor: color.hex,
                      transitionDelay: `${400 + index * 50}ms`,
                      boxShadow:
                        hoveredColor === color.name
                          ? `0 8px 30px ${color.hex}40`
                          : "0 4px 15px rgba(0,0,0,0.1)",
                    }}
                    aria-label={`Select ${color.name} color. ${color.mood}`}
                    aria-pressed={selectedColor === color.name}
                  >
                    {/* Check mark for selected */}
                    {selectedColor === color.name ? (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check
                          className={`w-6 h-6 ${
                            isLightColor(color.hex) ? "text-text-earthy" : "text-white"
                          }`}
                        />
                      </span>
                    ) : null}

                    {/* Ripple effect on hover */}
                    {hoveredColor === color.name && selectedColor !== color.name ? (
                      <span className="absolute inset-0 rounded-full border-2 border-current opacity-50 animate-pulse-soft" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected color name and mood */}
            <div
              className={`text-center md:text-left min-h-[100px] transition-all duration-700 ${
                isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "500ms" }}
            >
              <div className="relative">
                {/* Color name */}
                <h3
                  key={displayColor}
                  className="text-2xl font-serif text-text-earthy mb-2 animate-fade-up"
                >
                  {displayColor}
                </h3>

                {/* Mood text */}
                <p
                  key={`mood-${displayColor}`}
                  className="text-text-earthy/60 italic animate-fade-up"
                  style={{ animationDelay: "100ms" }}
                >
                  {displayColorData?.mood ||
                    defaultColorMoods[displayColor] ||
                    "A beautiful choice"}
                </p>
              </div>
            </div>

            {/* Color dot indicator (shows selected vs hovered) */}
            <div
              className={`flex items-center gap-3 justify-center md:justify-start transition-all duration-700 ${
                isInView ? "opacity-100" : "opacity-0"
              }`}
              style={{ transitionDelay: "600ms" }}
            >
              <span className="text-sm text-text-earthy/50">Selected:</span>
              <span
                className="w-6 h-6 rounded-full border-2 border-text-earthy/20 transition-all duration-300"
                style={{ backgroundColor: colors.find((c) => c.name === selectedColor)?.hex }}
              />
              {hoveredColor && hoveredColor !== selectedColor ? (
                <>
                  <span className="text-sm text-text-earthy/50">→</span>
                  <span
                    className="w-6 h-6 rounded-full border-2 border-accent-earthy animate-pulse-soft"
                    style={{ backgroundColor: displayColorData?.hex }}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Helper to determine if a color is light (for contrast)
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// Helper to calculate hue rotation (simplified color tinting)
function getHueRotation(hex: string): number {
  // This is a simplified approach - in production you might use more sophisticated color math
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max === min) return 0;

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / (max - min)) * 60;
  } else if (max === g) {
    hue = (2 + (b - r) / (max - min)) * 60;
  } else {
    hue = (4 + (r - g) / (max - min)) * 60;
  }

  return hue < 0 ? hue + 360 : hue;
}
