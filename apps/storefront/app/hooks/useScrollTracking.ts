/**
 * Scroll Depth Tracking Hook (Story 5.1)
 * Tracks how far users scroll on each page
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface ScrollDepthEvent {
  depth_percentage: 25 | 50 | 75 | 100;
  page_path: string;
  page_height: number;
  time_to_depth_ms: number;
}

type DepthMilestone = 25 | 50 | 75 | 100;

const MILESTONES: DepthMilestone[] = [25, 50, 75, 100];

/**
 * Hook to track scroll depth milestones
 * 
 * Captures events when user reaches 25%, 50%, 75%, and 100% of page
 *
 * Features:
 * - Only fires each milestone once per page
 * - Resets on route change
 * - Debounced scroll handler for performance
 * - Uses requestAnimationFrame for smooth tracking
 * 
 * @example
 * ```tsx
 * function App() {
 *   useScrollTracking();
 *   return <Outlet />;
 * }
 * ```
 */
export function useScrollTracking() {
  const location = useLocation();

  // Track which milestones have been reached on current page
  const reachedMilestones = useRef<Set<DepthMilestone>>(new Set());
  const pageLoadTime = useRef<number>(Date.now());
  const rafId = useRef<number | null>(null);

  // Calculate current scroll percentage
  const calculateScrollPercentage = useCallback((): number => {
    if (typeof window === 'undefined') return 0;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    // Avoid division by zero
    const scrollableHeight = scrollHeight - clientHeight;
    if (scrollableHeight <= 0) return 100; // Page fits in viewport

    return Math.min(100, Math.round((scrollTop / scrollableHeight) * 100));
  }, []);

  // Check and track milestones
  const checkMilestones = useCallback(() => {
    if (typeof window === 'undefined') return;

    const percentage = calculateScrollPercentage();
    const pagePath = location.pathname + location.search;
    const pageHeight = document.documentElement.scrollHeight;

    for (const milestone of MILESTONES) {
      if (percentage >= milestone && !reachedMilestones.current.has(milestone)) {
        reachedMilestones.current.add(milestone);
        
        const eventData: ScrollDepthEvent = {
          depth_percentage: milestone,
          page_path: pagePath,
          page_height: pageHeight,
          time_to_depth_ms: Date.now() - pageLoadTime.current,
        };
        
        posthog.capture('scroll_depth', eventData);

        if (import.meta.env.MODE === 'development') {
          console.log(`[Scroll] ${milestone}% reached on ${pagePath} (${eventData.time_to_depth_ms}ms)`);
        }
      }
    }
  }, [calculateScrollPercentage, location.pathname, location.search]);

  // Debounced scroll handler using RAF
  const handleScroll = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    
    rafId.current = requestAnimationFrame(() => {
      checkMilestones();
    });
  }, [checkMilestones]);

  // Reset milestones and check initial state on route change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reset tracking for new page
    reachedMilestones.current = new Set();
    pageLoadTime.current = Date.now();

    // Check initial scroll position (user might land mid-page from anchor/bookmark)
    // Delay slightly to ensure page has rendered
    const initialCheckTimer = setTimeout(() => {
      checkMilestones();
    }, 100);

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      clearTimeout(initialCheckTimer);
      window.removeEventListener('scroll', handleScroll);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [location.pathname, location.search, handleScroll, checkMilestones]);
}

export default useScrollTracking;
