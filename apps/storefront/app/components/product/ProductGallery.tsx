import { useState } from "react";

interface ProductGalleryProps {
  images: string[];
  title: string;
}

/**
 * Simple product image gallery with main image and thumbnail strip
 */
export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const mainImage = images[selectedIndex] || images[0] || "/placeholder-towel.jpg";
  const hasMultipleImages = images.length > 1;

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-card-earthy/10">
        <img
          src={mainImage}
          alt={title}
          className="w-full h-full object-cover transition-opacity duration-300"
          loading="eager"
        />
      </div>

      {/* Thumbnail Strip */}
      {hasMultipleImages && (
        <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedIndex(index)}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden transition-all duration-200 ${
                index === selectedIndex
                  ? "ring-2 ring-accent-earthy ring-offset-2"
                  : "opacity-70 hover:opacity-100"
              }`}
              aria-label={`View image ${index + 1}`}
              aria-current={index === selectedIndex ? "true" : undefined}
            >
              <img
                src={image}
                alt={`${title} - view ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
