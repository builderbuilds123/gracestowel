/**
 * Scroll Depth Tracking Hook (Story 5.2.3)
 * Tracks scroll milestones (25%, 50%, 75%, 100%)
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface ScrollDepthEvent {
  depth_percentage: 25 | 50 | 75 | 100;
  page_path: string;
  page_height: number;
  time_to_depth_ms: number;
}

/**
 * Hook to track scroll depth milestones
 * 
 * Captures:
 * - Depth milestones (25, 50, 75, 100%)
 * - Page height
 * - Time taken to reach depth
 * 
 * Implementation Details:
 * - Uses requestAnimationFrame for performance
 * - Debounces calculations
 * - Only fires once per threshold per pageview
 */
export function useScrollTracking() {
  const location = useLocation();
  const trackedMilestones = useRef<Set<number>>(new Set());
  const maxScrollDepth = useRef<number>(0);
  const startTime = useRef<number>(Date.now());
  const pathRef = useRef<string>(location.pathname);

  useEffect(() => {
    // Reset on path change
    if (pathRef.current !== location.pathname) {
      trackedMilestones.current.clear();
      maxScrollDepth.current = 0;
      startTime.current = Date.now();
      pathRef.current = location.pathname;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;
    let isScheduled = false;

    const checkScrollDepth = () => {
      isScheduled = false;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const winHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      // Calculate percentage scrolled
      // Formula: (scrollTop + winHeight) / docHeight * 100
      // This calculates how much of the page has been viewed
      const percent = Math.min(100, Math.round(((scrollTop + winHeight) / docHeight) * 100));

      // Only check milestones if we've scrolled further than before
      if (percent > maxScrollDepth.current) {
        maxScrollDepth.current = percent;
        
        const milestones = [25, 50, 75, 100];
        const timeToDepth = Date.now() - startTime.current;
        
        milestones.forEach((milestone) => {
          if (percent >= milestone && !trackedMilestones.current.has(milestone)) {
            trackedMilestones.current.add(milestone);

            const eventData: ScrollDepthEvent = {
              depth_percentage: milestone as 25 | 50 | 75 | 100,
              page_path: location.pathname,
              page_height: docHeight,
              time_to_depth_ms: timeToDepth,
            };

            posthog.capture('scroll_depth', eventData);

            if (import.meta.env.MODE === 'development') {
              console.log(`[Scroll] reached ${milestone}% (${timeToDepth}ms)`);
            }
          }
        });
      }
    };

    const onScroll = () => {
      if (!isScheduled) {
        isScheduled = true;
        rafId = requestAnimationFrame(checkScrollDepth);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    
    // Initial check in case page is short or already scrolled
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [location.pathname]); // Re-bind when path changes to ensure fresh state closure if needed
}

export default useScrollTracking;
