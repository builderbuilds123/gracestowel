import { useRef, useEffect, useState } from "react";
import { ChevronDown } from "../../lib/icons";
import { useParallax } from "./hooks";
import { FloatingFibers } from "./FloatingFibers";

interface HeroCanvasProps {
  image: string;
  title: string;
  subtitle?: string;
  onScrollIndicatorClick?: () => void;
}

/**
 * Full-viewport hero section with macro texture image
 * Features parallax scrolling and floating cotton fibers
 */
export function HeroCanvas({
  image,
  title,
  subtitle = "Feel the Difference",
  onScrollIndicatorClick,
}: HeroCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const { style: parallaxStyle } = useParallax({ speed: 0.3 });

  // Trigger title animation after image loads
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => setTitleVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  const handleScrollClick = () => {
    if (onScrollIndicatorClick) {
      onScrollIndicatorClick();
    } else {
      // Default: scroll to next section
      const nextSection = containerRef.current?.nextElementSibling;
      nextSection?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative h-screen w-full overflow-hidden"
      aria-label="Product hero"
    >
      {/* Background texture image with parallax */}
      <div
        className="absolute inset-0 scale-110"
        style={parallaxStyle}
      >
        <img
          src={image}
          alt=""
          className={`w-full h-full object-cover transition-opacity duration-1000 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setIsLoaded(true)}
          fetchPriority="high"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg-earthy/30 via-transparent to-bg-earthy/60" />
        {/* Vignette effect */}
        <div className="absolute inset-0 bg-radial-gradient pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 0%, rgba(252, 250, 248, 0.4) 100%)"
          }}
        />
      </div>

      {/* Floating cotton fibers */}
      <FloatingFibers count={20} />

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        {/* Subtitle */}
        <p
          className={`text-sm md:text-base uppercase tracking-[0.3em] text-accent-earthy mb-4 transition-all duration-700 ${
            titleVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          {subtitle}
        </p>

        {/* Main title with letter animation */}
        <h1 className="overflow-hidden">
          <span className="flex flex-wrap justify-center gap-x-3 md:gap-x-4">
            {title.split(" ").map((word, wordIndex) => (
              <span key={wordIndex} className="flex">
                {word.split("").map((letter, letterIndex) => (
                  <span
                    key={`${wordIndex}-${letterIndex}`}
                    className={`inline-block text-4xl md:text-6xl lg:text-7xl font-serif text-text-earthy transition-all duration-500 ${
                      titleVisible
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-8"
                    }`}
                    style={{
                      transitionDelay: `${400 + wordIndex * 100 + letterIndex * 50}ms`,
                    }}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </h1>

        {/* Decorative line */}
        <div
          className={`w-24 h-0.5 bg-accent-earthy/60 mt-8 transition-all duration-700 ${
            titleVisible ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
          }`}
          style={{ transitionDelay: "800ms" }}
        />
      </div>

      {/* Scroll indicator */}
      <button
        onClick={handleScrollClick}
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-earthy/70 hover:text-accent-earthy transition-all duration-500 cursor-pointer group ${
          titleVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionDelay: "1000ms" }}
        aria-label="Scroll to explore"
      >
        <span className="text-xs uppercase tracking-widest">Explore</span>
        <ChevronDown className="w-5 h-5 animate-bounce-gentle group-hover:text-accent-earthy" />
      </button>
    </section>
  );
}
