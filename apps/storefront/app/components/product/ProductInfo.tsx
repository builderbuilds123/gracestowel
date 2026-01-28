import React, { useState } from "react";
import { Minus, Plus, ShoppingBag, Check } from "../../lib/icons";
import { SimpleColorPicker } from "./SimpleColorPicker";
import { Accordion, AccordionItem } from "../ui/Accordion";
import type { ProductDetail } from "../../lib/product-transformer";

interface ColorOption {
  name: string;
  hex: string;
}

interface ProductInfoProps {
  product: ProductDetail;
  colors: ColorOption[];
  selectedColor: string;
  onColorChange: (colorName: string) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
  isOutOfStock: boolean;
}

/**
 * Product information panel with purchase controls
 * ✅ Memoized component to prevent unnecessary re-renders (Issue #7 fix)
 */
export const ProductInfo = React.memo(function ProductInfo({
  product,
  colors,
  selectedColor,
  onColorChange,
  quantity,
  onQuantityChange,
  onAddToCart,
  isOutOfStock,
}: ProductInfoProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleAddToCart = () => {
    if (isOutOfStock || isAdding) return;

    setIsAdding(true);
    setTimeout(() => {
      onAddToCart();
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-serif text-text-earthy">
        {product.title}
      </h1>

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl md:text-3xl font-serif text-accent-earthy">
          {product.formattedPrice}
        </span>
        {product.originalPrice && product.originalPrice > product.price ? (
          <span className="text-lg text-text-earthy/50 line-through">
            ${product.originalPrice.toFixed(2)}
          </span>
        ) : null}
      </div>

      {/* Description */}
      {product.description ? (
        <p className="text-text-earthy/70 leading-relaxed">
          {product.description}
        </p>
      ) : null}

      {/* Color Selection */}
      {colors.length > 0 ? (
        <SimpleColorPicker
          colors={colors}
          selectedColor={selectedColor}
          onColorChange={onColorChange}
        />
      ) : null}

      {/* Stock Status */}
      {isOutOfStock ? (
        <p className="text-red-600 font-medium">Out of Stock</p>
      ) : null}

      {/* Quantity and Add to Cart */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Quantity Selector */}
        <div className="flex items-center gap-1 bg-card-earthy/20 rounded-full p-1 w-fit">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4" />
          </button>

          <span className="w-10 text-center font-medium text-text-earthy">
            {quantity}
          </span>

          <button
            onClick={() => onQuantityChange(quantity + 1)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-earthy hover:bg-card-earthy/40 transition-colors"
            aria-label="Increase quantity"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={isOutOfStock || isAdding}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium transition-colors ${
            isOutOfStock
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : showSuccess
              ? "bg-green-500 text-white"
              : "bg-accent-earthy text-white hover:bg-accent-earthy/90"
          }`}
        >
          {isOutOfStock ? (
            "Out of Stock"
          ) : showSuccess ? (
            <>
              <Check className="w-5 h-5" />
              Added to Cart
            </>
          ) : isAdding ? (
            "Adding..."
          ) : (
            <>
              <ShoppingBag className="w-5 h-5" />
              Add to Cart
            </>
          )}
        </button>
      </div>

      {/* Features List (if available) */}
       {/* Product Details Accordion */}
       <Accordion>
         {product.features && product.features.length > 0 ? (
           <AccordionItem title="Details" defaultOpen={true}>
             <ul className="space-y-2">
               {product.features.map((feature) => (
                 <li key={feature} className="flex items-start gap-2">
                   <span className="text-accent-earthy mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                   <span>{feature}</span>
                 </li>
               ))}
             </ul>
           </AccordionItem>
         ) : null}

         {product.dimensions && product.dimensions.length > 0 ? (
           <AccordionItem title="Dimensions">
             <ul className="space-y-1">
               {product.dimensions.map((dim) => (
                 <li key={dim.label} className="grid grid-cols-2 gap-4">
                   <span className="text-text-earthy/60">{dim.label}</span>
                   <span className="font-medium text-text-earthy">{dim.value}</span>
                 </li>
               ))}
             </ul>
           </AccordionItem>
         ) : null}

         {product.careInstructions && product.careInstructions.length > 0 ? (
           <AccordionItem title="Care Guide">
             <ul className="space-y-2">
               {product.careInstructions.map((instruction) => (
                 <li key={instruction} className="flex items-start gap-2">
                    <span className="text-accent-earthy mt-1">•</span>
                   <span>{instruction}</span>
                 </li>
               ))}
             </ul>
           </AccordionItem>
         ) : null}
       </Accordion>
    </div>
  );
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if these props actually changed
    return (
        prevProps.product.id === nextProps.product.id &&
        prevProps.product.price === nextProps.product.price &&
        prevProps.selectedColor === nextProps.selectedColor &&
        prevProps.quantity === nextProps.quantity &&
        prevProps.isOutOfStock === nextProps.isOutOfStock &&
        prevProps.colors.length === nextProps.colors.length &&
        prevProps.colors.every((c, i) => c.name === nextProps.colors[i]?.name && c.hex === nextProps.colors[i]?.hex)
    );
});
