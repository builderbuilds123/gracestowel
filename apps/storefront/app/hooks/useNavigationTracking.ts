/**
 * Navigation Tracking Hook (Story 5.2.2)
 * Tracks route changes and time spent on pages
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import posthog from 'posthog-js';

interface NavigationEvent {
  from_path: string;
  to_path: string;
  navigation_type: 'link' | 'back' | 'forward' | 'direct' | 'reload';
  time_on_previous_page_ms: number;
}

/**
 * Map React Router navigation type to our event schema
 */
function mapNavigationType(type: ReturnType<typeof useNavigationType>): NavigationEvent['navigation_type'] {
  switch (type) {
    case 'POP':
      // POP can be back or forward, we can't distinguish easily
      // Default to 'back' as it's more common
      return 'back';
    case 'PUSH':
      return 'link';
    case 'REPLACE':
      return 'direct';
    default:
      return 'link';
  }
}

/**
 * Hook to track navigation between pages
 * 
 * Captures:
 * - From/to paths
 * - Navigation type (link click, back button, direct navigation)
 * - Time spent on previous page
 * 
 * @example
 * ```tsx
 * // In root.tsx or layout component
 * function App() {
 *   useNavigationTracking();
 *   return <Outlet />;
 * }
 * ```
 */
export function useNavigationTracking() {
  const location = useLocation();
  const navigationType = useNavigationType();
  
  // Track when user arrived on current page
  const pageEntryTime = useRef<number>(Date.now());
  const previousPath = useRef<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip tracking on server
    if (typeof window === 'undefined') return;
    
    const currentPath = location.pathname + location.search;
    const now = Date.now();
    
    // Don't track the initial page load as a "navigation"
    // PostHog's autocapture handles the initial pageview
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousPath.current = currentPath;
      pageEntryTime.current = now;
      return;
    }
    
    // Only track if path actually changed
    if (previousPath.current && previousPath.current !== currentPath) {
      const timeOnPreviousPage = now - pageEntryTime.current;
      
      const eventData: NavigationEvent = {
        from_path: previousPath.current,
        to_path: currentPath,
        navigation_type: mapNavigationType(navigationType),
        time_on_previous_page_ms: timeOnPreviousPage,
      };
      
      posthog.capture('navigation', eventData);
      
      if (import.meta.env.MODE === 'development') {
        console.log(`[Navigation] ${eventData.from_path} → ${eventData.to_path} (${eventData.navigation_type}, ${timeOnPreviousPage}ms on prev page)`);
      }
    }
    
    // Update refs for next navigation
    previousPath.current = currentPath;
    pageEntryTime.current = now;
  }, [location.pathname, location.search, navigationType]);
}

export default useNavigationTracking;
