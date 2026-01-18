import { useState, useEffect, useRef, useCallback } from "react";

interface InViewOptions {
  threshold?: number; // 0-1, percentage of element visible to trigger
  rootMargin?: string; // CSS margin around root
  triggerOnce?: boolean; // Only trigger once, then stop observing
  delay?: number; // Delay in ms before setting isInView to true
}

/**
 * Hook for detecting when an element enters the viewport
 * Perfect for scroll-triggered animations
 */
export function useInViewReveal(options: InViewOptions = {}) {
  const { threshold = 0.1, rootMargin = "0px", triggerOnce = true, delay = 0 } = options;

  const elementRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !elementRef.current) return;
    if (triggerOnce && hasTriggered) return;

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsInView(true);
      setHasTriggered(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (delay > 0) {
              setTimeout(() => {
                setIsInView(true);
                setHasTriggered(true);
              }, delay);
            } else {
              setIsInView(true);
              setHasTriggered(true);
            }

            if (triggerOnce) {
              observer.unobserve(entry.target);
            }
          } else if (!triggerOnce) {
            setIsInView(false);
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce, delay, hasTriggered]);

  return { ref: elementRef, isInView, hasTriggered };
}

/**
 * Hook for staggered reveal animations (multiple children)
 * Returns a function to get delay for each child index
 */
export function useStaggeredReveal(
  itemCount: number,
  options: InViewOptions & { staggerDelay?: number } = {}
) {
  const { staggerDelay = 100, ...inViewOptions } = options;
  const { ref, isInView } = useInViewReveal(inViewOptions);

  const getItemDelay = useCallback(
    (index: number) => {
      return isInView ? index * staggerDelay : 0;
    },
    [isInView, staggerDelay]
  );

  const getItemStyle = useCallback(
    (index: number) => {
      const delay = getItemDelay(index);
      return {
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      };
    },
    [isInView, getItemDelay]
  );

  return { ref, isInView, getItemDelay, getItemStyle };
}

/**
 * Hook for scroll-linked progress within an element
 * Returns progress 0-1 as element scrolls through viewport
 */
export function useScrollLinkedProgress() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !elementRef.current) return;

    const handleScroll = () => {
      const rect = elementRef.current!.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Progress from element entering bottom to leaving top
      const start = viewportHeight; // Element top at viewport bottom
      const end = -rect.height; // Element bottom at viewport top
      const current = rect.top;

      const scrollProgress = (start - current) / (start - end);
      setProgress(Math.max(0, Math.min(1, scrollProgress)));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { ref: elementRef, progress };
}
