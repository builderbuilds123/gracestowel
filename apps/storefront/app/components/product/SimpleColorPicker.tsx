import { Check } from "lucide-react";

interface ColorOption {
  name: string;
  hex: string;
}

interface SimpleColorPickerProps {
  colors: ColorOption[];
  selectedColor: string;
  onColorChange: (colorName: string) => void;
}

/**
 * Simple inline color swatches for product selection
 */
export function SimpleColorPicker({
  colors,
  selectedColor,
  onColorChange,
}: SimpleColorPickerProps) {
  if (colors.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-earthy/70">Color:</span>
        <span className="text-sm font-medium text-text-earthy">{selectedColor}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const isSelected = selectedColor === color.name;
          const isLight = isLightColor(color.hex);

          return (
            <button
              key={color.name}
              onClick={() => onColorChange(color.name)}
              className={`relative w-9 h-9 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-earthy ${
                isSelected
                  ? "ring-2 ring-text-earthy ring-offset-2 scale-110"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.name}`}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Check
                    className={`w-4 h-4 ${isLight ? "text-text-earthy" : "text-white"}`}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
