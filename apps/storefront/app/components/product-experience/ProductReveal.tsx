import { useRef } from "react";
import { useScrollLinkedProgress, useInViewReveal } from "./hooks";

interface ProductRevealProps {
  images: string[];
  title: string;
  price: number;
  originalPrice?: number;
  currencySymbol?: string;
}

/**
 * Theatrical product reveal that "unfolds" as user scrolls
 * Creates a sense of discovery and anticipation
 */
export function ProductReveal({
  images,
  title,
  price,
  originalPrice,
  currencySymbol = "$",
}: ProductRevealProps) {
  const { ref: scrollRef, progress } = useScrollLinkedProgress();
  const { ref: titleRef, isInView: titleVisible } = useInViewReveal({ threshold: 0.3 });

  // Use first image or fallback
  const mainImage = images[0] || "/placeholder-towel.jpg";

  // Calculate reveal animations based on scroll progress
  const clipProgress = Math.min(1, progress * 1.5); // Reveal happens in first 66% of scroll
  const clipPath = `inset(${(1 - clipProgress) * 30}% ${(1 - clipProgress) * 10}% ${(1 - clipProgress) * 30}% ${(1 - clipProgress) * 10}% round 24px)`;

  return (
    <section
      ref={scrollRef}
      className="min-h-[120vh] py-20 px-6 flex items-center justify-center"
      aria-label="Product reveal"
    >
      <div className="max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image with unfold animation */}
          <div className="relative">
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-soft-lg transition-all duration-300"
              style={{
                clipPath,
                transform: `scale(${0.9 + clipProgress * 0.1})`,
              }}
            >
              <img
                src={mainImage}
                alt={title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Soft overlay that fades as we reveal */}
              <div
                className="absolute inset-0 bg-bg-earthy pointer-events-none transition-opacity duration-500"
                style={{ opacity: Math.max(0, 0.3 - clipProgress * 0.5) }}
              />
            </div>

            {/* Decorative elements that appear as image reveals */}
            <div
              className="absolute -bottom-4 -right-4 w-32 h-32 bg-card-earthy/30 rounded-full -z-10 transition-all duration-700"
              style={{
                opacity: clipProgress,
                transform: `scale(${clipProgress}) translate(${(1 - clipProgress) * 20}px, ${(1 - clipProgress) * 20}px)`,
              }}
            />
            <div
              className="absolute -top-6 -left-6 w-20 h-20 bg-accent-earthy/10 rounded-full -z-10 transition-all duration-700"
              style={{
                opacity: clipProgress,
                transform: `scale(${clipProgress}) translate(${(1 - clipProgress) * -20}px, ${(1 - clipProgress) * -20}px)`,
              }}
            />
          </div>

          {/* Product info with slide animations */}
          <div ref={titleRef} className="space-y-6">
            {/* Title slides in from left */}
            <h2
              className={`text-4xl md:text-5xl lg:text-6xl font-serif text-text-earthy leading-tight transition-all duration-700 ${
                titleVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-10"
              }`}
            >
              {title}
            </h2>

            {/* Price badge slides in from right */}
            <div
              className={`flex items-baseline gap-3 transition-all duration-700 ${
                titleVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-10"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              <span className="text-3xl md:text-4xl font-serif text-accent-earthy">
                {currencySymbol}
                {price.toFixed(2)}
              </span>
              {originalPrice && originalPrice > price ? (
                <span className="text-lg text-text-earthy/50 line-through">
                  {currencySymbol}
                  {originalPrice.toFixed(2)}
                </span>
              ) : null}
            </div>

            {/* Tagline fades up */}
            <p
              className={`text-lg text-text-earthy/70 leading-relaxed max-w-md transition-all duration-700 ${
                titleVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              Luxuriously soft, endlessly absorbent. Crafted from the finest Turkish cotton
              to transform your everyday routine into a spa-like experience.
            </p>

            {/* Decorative line */}
            <div
              className={`w-16 h-1 bg-accent-earthy/40 rounded-full transition-all duration-700 ${
                titleVisible ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
              }`}
              style={{ transitionDelay: "600ms", transformOrigin: "left" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
