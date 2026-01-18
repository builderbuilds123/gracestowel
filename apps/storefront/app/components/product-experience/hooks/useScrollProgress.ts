import { useState, useEffect, useCallback } from "react";

/**
 * Hook that returns normalized scroll progress (0-1) for the page or a specific element
 * @param elementRef - Optional ref to track scroll within a specific element
 * @returns scrollProgress (0-1), scrollY (raw pixels), and viewportHeight
 */
export function useScrollProgress(elementRef?: React.RefObject<HTMLElement>) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const handleScroll = useCallback(() => {
    if (typeof window === "undefined") return;

    const currentScrollY = window.scrollY;
    setScrollY(currentScrollY);

    if (elementRef?.current) {
      // Track progress relative to a specific element
      const rect = elementRef.current.getBoundingClientRect();
      const elementTop = rect.top + currentScrollY;
      const elementHeight = rect.height;
      const progress = Math.max(
        0,
        Math.min(1, (currentScrollY - elementTop + window.innerHeight) / (elementHeight + window.innerHeight))
      );
      setScrollProgress(progress);
    } else {
      // Track overall page scroll progress
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? currentScrollY / docHeight : 0;
      setScrollProgress(Math.max(0, Math.min(1, progress)));
    }
  }, [elementRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setViewportHeight(window.innerHeight);
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", () => {
      setViewportHeight(window.innerHeight);
      handleScroll();
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [handleScroll]);

  return { scrollProgress, scrollY, viewportHeight };
}

/**
 * Hook that returns scroll progress within a specific viewport range
 * @param startVh - Start of range in vh (0-100)
 * @param endVh - End of range in vh (0-100)
 * @returns progress (0-1) within the specified range
 */
export function useScrollRange(startVh: number, endVh: number) {
  const { scrollY, viewportHeight } = useScrollProgress();

  const startPx = (startVh / 100) * viewportHeight;
  const endPx = (endVh / 100) * viewportHeight;
  const range = endPx - startPx;

  if (range <= 0) return 0;

  const progress = (scrollY - startPx) / range;
  return Math.max(0, Math.min(1, progress));
}
