/**
 * Engagement Tracking Hook (Story 5.2.4)
 * Tracks engaged vs idle time on a page
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface PageEngagementEvent {
  page_path: string;
  engaged_time_ms: number;
  idle_time_ms: number;
  total_time_ms: number;
}

const IDLE_THRESHOLD_MS = 30000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

/**
 * Hook to track user engagement on a page
 * 
 * Captures:
 * - Engaged time (active usage)
 * - Idle time (no interaction for >30s)
 * - Total time on page
 * 
 * Implementation Details:
 * - Tracks user activity events to reset idle timer
 * - Accumulates time into engaged/idle buckets
 * - Emits event on route change or unload
 */
export function useEngagementTracking() {
  const location = useLocation();
  
  // State refs to avoid re-renders
  const isIdle = useRef(false);
  const lastUpdateTime = useRef(Date.now());
  const pageEntryTime = useRef(Date.now());

  const engagedTime = useRef(0);
  const idleTime = useRef(0);

  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const pathRef = useRef(location.pathname);

  // Update time accumulators based on current state
  const updateTimeAccumulators = () => {
    const now = Date.now();
    const delta = now - lastUpdateTime.current;
    
    if (delta > 0) {
      if (isIdle.current) {
        idleTime.current += delta;
      } else {
        engagedTime.current += delta;
      }
    }
    
    lastUpdateTime.current = now;
  };

  // Function to send event
  const sendEngagementEvent = () => {
    // Force final update before sending
    updateTimeAccumulators();
    
    const totalTime = Date.now() - pageEntryTime.current;
    
    // Only send if meaningful time spent (>100ms)
    if (totalTime > 100) {
      const eventData: PageEngagementEvent = {
        page_path: pathRef.current,
        engaged_time_ms: Math.round(engagedTime.current),
        idle_time_ms: Math.round(idleTime.current),
        total_time_ms: Math.round(totalTime),
      };

      posthog.capture('page_engagement', eventData);
      
      if (import.meta.env.MODE === 'development') {
        console.log(`[Engagement] ${eventData.page_path}: Engaged ${eventData.engaged_time_ms}ms, Idle ${eventData.idle_time_ms}ms`);
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reset state for new page
    pathRef.current = location.pathname;
    isIdle.current = false;
    const now = Date.now();
    lastUpdateTime.current = now;
    pageEntryTime.current = now;
    engagedTime.current = 0;
    idleTime.current = 0;

    const goIdle = () => {
      if (!isIdle.current) {
        // Transition to idle
        updateTimeAccumulators();
        isIdle.current = true;

        if (import.meta.env.MODE === 'development') {
          console.log('[Engagement] Went idle');
        }
      }
    };

    const handleActivity = () => {
      // Transition from idle to active, or just update active time
      updateTimeAccumulators();

      if (isIdle.current) {
        isIdle.current = false;

        if (import.meta.env.MODE === 'development') {
          console.log('[Engagement] Active again');
        }
      }

      // Reset idle timer
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      idleTimer.current = setTimeout(goIdle, IDLE_THRESHOLD_MS);
    };

    // Attach listeners (throttled)
    let activityTimeout: NodeJS.Timeout | null = null;
    const throttledActivity = () => {
      if (!activityTimeout) {
        handleActivity();
        activityTimeout = setTimeout(() => {
          activityTimeout = null;
        }, 500); // Throttle activity updates to 500ms
      }
    };

    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, throttledActivity, { passive: true });
    });

    // Initial idle timer
    idleTimer.current = setTimeout(goIdle, IDLE_THRESHOLD_MS);
    
    return () => {
      // Clean up
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (activityTimeout) clearTimeout(activityTimeout);

      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, throttledActivity);
      });

      // Send event on unmount/change
      sendEngagementEvent();
    };
  }, [location.pathname]);
}

export default useEngagementTracking;
