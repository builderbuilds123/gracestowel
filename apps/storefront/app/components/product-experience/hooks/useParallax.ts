import { useState, useEffect, useCallback, useRef } from "react";

interface ParallaxOptions {
  speed?: number; // Multiplier for scroll speed (0.5 = half speed, 2 = double speed)
  direction?: "up" | "down";
  disabled?: boolean;
}

/**
 * Hook for creating parallax scroll effects
 * @param options - Configuration for parallax behavior
 * @returns transform value to apply to element
 */
export function useParallax(options: ParallaxOptions = {}) {
  const { speed = 0.3, direction = "up", disabled = false } = options;
  const [transform, setTransform] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check for reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleScroll = useCallback(() => {
    if (typeof window === "undefined" || disabled || isReducedMotion) return;

    const scrollY = window.scrollY;
    const movement = scrollY * speed * (direction === "up" ? -1 : 1);
    setTransform(movement);
  }, [speed, direction, disabled, isReducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return {
    transform,
    style: {
      transform: `translateY(${transform}px)`,
      willChange: disabled || isReducedMotion ? "auto" : "transform",
    },
  };
}

/**
 * Hook for element-relative parallax (element moves as it enters viewport)
 */
export function useElementParallax(speed: number = 0.2) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !elementRef.current || isReducedMotion) return;

    const handleScroll = () => {
      const rect = elementRef.current!.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate how far the element is through the viewport
      const elementProgress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
      const clampedProgress = Math.max(0, Math.min(1, elementProgress));

      // Center the parallax effect (0.5 = centered)
      const centered = (clampedProgress - 0.5) * 2;
      setOffset(centered * 100 * speed);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed, isReducedMotion]);

  return {
    ref: elementRef,
    offset,
    style: {
      transform: `translateY(${offset}px)`,
      willChange: isReducedMotion ? "auto" : "transform",
    },
  };
}
