import { useEffect, useCallback, useRef } from 'react';

interface UseExitIntentOptions {
  /** Pixels from top of viewport to trigger exit intent (default: 20) */
  sensitivity?: number;
  /** Minimum viewport width to enable exit intent (default: 1024, desktop only) */
  minWidth?: number;
  /** Session storage key for cooldown (default: 'ph_exit_intent_shown') */
  cooldownKey?: string;
  /** Whether exit intent detection is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook for detecting exit intent (desktop only)
 *
 * Exit intent is detected when the user moves their mouse cursor
 * towards the top of the viewport, indicating they may be about to
 * close the tab or navigate away.
 *
 * This is desktop-only as mobile devices don't have mouse cursors.
 *
 * @param onExitIntent - Callback fired when exit intent is detected
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { triggerExitIntentSurvey } = usePostHogSurveys();
 *
 * useExitIntent(() => {
 *   triggerExitIntentSurvey();
 * });
 * ```
 */
export function useExitIntent(
  onExitIntent: () => void,
  options: UseExitIntentOptions = {}
): void {
  const {
    sensitivity = 20,
    minWidth = 1024,
    cooldownKey = 'ph_exit_intent_shown',
    enabled = true,
  } = options;

  // Track if we've already triggered in this session
  const hasTriggeredRef = useRef(false);

  const handleMouseLeave = useCallback(
    (event: MouseEvent) => {
      // Only trigger if mouse leaves near the top of the viewport
      if (event.clientY > sensitivity) {
        return;
      }

      // Check if already triggered this session
      if (hasTriggeredRef.current) {
        return;
      }

      // Check session cooldown
      if (typeof window !== 'undefined') {
        try {
          if (sessionStorage.getItem(cooldownKey)) {
            return;
          }
          // Mark as shown for this session
          sessionStorage.setItem(cooldownKey, 'true');
        } catch {
          // Storage access failed - continue anyway
        }
      }

      // Mark as triggered
      hasTriggeredRef.current = true;

      // Fire the callback
      onExitIntent();
    },
    [sensitivity, cooldownKey, onExitIntent]
  );

  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined') return;

    // Skip if disabled
    if (!enabled) return;

    // Only enable on desktop (large screens with mouse)
    if (window.innerWidth < minWidth) return;

    // Check if already shown this session
    try {
      if (sessionStorage.getItem(cooldownKey)) {
        return;
      }
    } catch {
      // Storage access failed - continue anyway
    }

    // Add event listener
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [enabled, minWidth, cooldownKey, handleMouseLeave]);
}

export default useExitIntent;
