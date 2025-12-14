/**
 * User Engagement Tracking Hook (Story 5.1)
 * Tracks active/idle time on pages
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface PageEngagementEvent {
  page_path: string;
  engaged_time_ms: number;
  idle_time_ms: number;
  total_time_ms: number;
  max_idle_period_ms: number;
}

const IDLE_THRESHOLD_MS = 30000; // 30 seconds of no activity = idle
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];

/**
 * Hook to track user engagement (active vs idle time)
 * 
 * Tracks:
 * - Active engagement time (user interacting)
 * - Idle time (no activity for 30+ seconds)
 * - Total time on page
 * 
 * Fires event on:
 * - Route change (leaving page)
 * - Page unload (closing tab/browser)
 * 
 * @example
 * ```tsx
 * function App() {
 *   useEngagementTracking();
 *   return <Outlet />;
 * }
 * ```
 */
export function useEngagementTracking() {
  const location = useLocation();
  
  // Timing refs
  const pageLoadTime = useRef<number>(Date.now());
  const lastActivityTime = useRef<number>(Date.now());
  const idleStartTime = useRef<number | null>(null);
  const totalIdleTime = useRef<number>(0);
  const maxIdlePeriod = useRef<number>(0);
  const idleCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIdle = useRef<boolean>(false);
  const previousPath = useRef<string | null>(null);

  // Throttle for mouse move (very frequent)
  const lastMouseMoveTrack = useRef<number>(0);

  // Track user activity
  const trackActivity = useCallback((event?: Event) => {
    if (typeof window === 'undefined') return;
    
    // Throttle mousemove events (max once per 100ms)
    if (event?.type === 'mousemove') {
      const now = Date.now();
      if (now - lastMouseMoveTrack.current < 100) return;
      lastMouseMoveTrack.current = now;
    }
    
    const now = Date.now();
    
    // If user was idle, record the idle period
    if (isIdle.current && idleStartTime.current) {
      const idlePeriod = now - idleStartTime.current;
      totalIdleTime.current += idlePeriod;
      if (idlePeriod > maxIdlePeriod.current) {
        maxIdlePeriod.current = idlePeriod;
      }
      
      if (import.meta.env.MODE === 'development') {
        console.log(`[Engagement] User returned from idle (${Math.round(idlePeriod / 1000)}s)`);
      }
    }
    
    lastActivityTime.current = now;
    idleStartTime.current = null;
    isIdle.current = false;
  }, []);

  // Check for idle state periodically
  const checkIdle = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime.current;
    
    if (timeSinceActivity >= IDLE_THRESHOLD_MS && !isIdle.current) {
      isIdle.current = true;
      idleStartTime.current = lastActivityTime.current + IDLE_THRESHOLD_MS;
      
      if (import.meta.env.MODE === 'development') {
        console.log('[Engagement] User went idle');
      }
    }
  }, []);

  // Send engagement event
  const sendEngagementEvent = useCallback((pagePath: string) => {
    if (typeof window === 'undefined') return;
    
    const now = Date.now();
    const totalTime = now - pageLoadTime.current;
    
    // If currently idle, add current idle period to total
    let finalIdleTime = totalIdleTime.current;
    if (isIdle.current && idleStartTime.current) {
      finalIdleTime += now - idleStartTime.current;
      if (now - idleStartTime.current > maxIdlePeriod.current) {
        maxIdlePeriod.current = now - idleStartTime.current;
      }
    }
    
    const engagedTime = totalTime - finalIdleTime;
    
    // Only send if user spent meaningful time on page (> 1 second)
    if (totalTime < 1000) return;
    
    const eventData: PageEngagementEvent = {
      page_path: pagePath,
      engaged_time_ms: Math.max(0, engagedTime),
      idle_time_ms: finalIdleTime,
      total_time_ms: totalTime,
      max_idle_period_ms: maxIdlePeriod.current,
    };
    
    posthog.capture('page_engagement', eventData);
    
    if (import.meta.env.MODE === 'development') {
      console.log(`[Engagement] ${pagePath}: ${Math.round(engagedTime / 1000)}s engaged, ${Math.round(finalIdleTime / 1000)}s idle, ${Math.round(totalTime / 1000)}s total`);
    }
  }, []);

  // Reset tracking for new page
  const resetTracking = useCallback(() => {
    pageLoadTime.current = Date.now();
    lastActivityTime.current = Date.now();
    idleStartTime.current = null;
    totalIdleTime.current = 0;
    maxIdlePeriod.current = 0;
    isIdle.current = false;
  }, []);

  // Handle route changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const currentPath = location.pathname + location.search;
    
    // Send engagement event for previous page
    if (previousPath.current && previousPath.current !== currentPath) {
      sendEngagementEvent(previousPath.current);
    }
    
    // Reset for new page
    resetTracking();
    previousPath.current = currentPath;
    
    // Set up activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, trackActivity, { passive: true });
    });
    
    // Set up idle checking interval
    idleCheckInterval.current = setInterval(checkIdle, 5000);
    
    // Handle page unload
    const handleBeforeUnload = () => {
      sendEngagementEvent(currentPath);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Handle visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away - mark as idle
        if (!isIdle.current) {
          isIdle.current = true;
          idleStartTime.current = Date.now();
        }
      } else {
        // User came back
        trackActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, trackActivity);
      });
      if (idleCheckInterval.current) {
        clearInterval(idleCheckInterval.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [location.pathname, location.search, trackActivity, checkIdle, sendEngagementEvent, resetTracking]);
}

export default useEngagementTracking;
