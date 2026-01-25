import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, X } from '../lib/icons';
import { usePostHogSurveys } from '../hooks/usePostHogSurveys';
import { useExitIntent } from '../hooks/useExitIntent';

const DISMISSED_KEY = 'ph_feedback_button_dismissed';
const BUTTON_DELAY_MS = 3000; // Show button after 3 seconds

/**
 * PostHogSurveyTrigger - Minimal component for PostHog native surveys
 *
 * Replaces the custom FeedbackWidget with a simpler approach:
 * - Floating "Feedback" button that triggers the Feature Request survey
 * - Exit intent detection that triggers the CSAT survey (desktop only)
 *
 * All survey UI is handled by PostHog's native survey popover.
 * This component only handles:
 * 1. When to show the floating button
 * 2. Triggering programmatic surveys (Feature Request, Exit Intent CSAT)
 */
export function PostHogSurveyTrigger() {
  const [showButton, setShowButton] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAnimatedIn, setIsAnimatedIn] = useState(false);

  const { triggerFeatureRequest, triggerExitIntentSurvey } = usePostHogSurveys();

  // Check if button was dismissed this session
  const isDismissed = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  }, []);

  // Show floating button after delay
  useEffect(() => {
    if (isDismissed()) return;

    const timer = setTimeout(() => {
      setShowButton(true);
      // Small delay for animation
      setTimeout(() => setIsAnimatedIn(true), 100);
    }, BUTTON_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isDismissed]);

  // Collapse button on scroll
  useEffect(() => {
    if (!showButton) return;

    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 200) {
        setIsCollapsed(true);
      } else if (currentScrollY < lastScrollY - 50) {
        setIsCollapsed(false);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showButton]);

  // Exit intent detection - triggers CSAT survey on desktop
  useExitIntent(() => {
    triggerExitIntentSurvey();
  });

  const handleClick = () => {
    const triggered = triggerFeatureRequest();
    // Only hide button if survey was actually triggered (not on cooldown)
    // The PostHog survey popup will appear separately
    if (triggered) {
      // Small delay to let the survey appear before hiding button
      setTimeout(() => {
        setShowButton(false);
      }, 500);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(DISMISSED_KEY, 'true');
      } catch {
        // Storage access failed - continue anyway
      }
    }
    setShowButton(false);
  };

  if (!showButton) return null;

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-40
        transition-all duration-300 ease-out
        ${isAnimatedIn ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
      `}
    >
      <div className="relative group">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 w-5 h-5 bg-gray-200 rounded-full
                   flex items-center justify-center
                   opacity-60 hover:opacity-100 focus:opacity-100 transition-opacity
                   hover:bg-gray-300 focus:bg-gray-300 text-gray-600
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-earthy"
          aria-label="Dismiss feedback button"
        >
          <X className="w-3 h-3" />
        </button>

        {/* Main feedback button */}
        <button
          onClick={handleClick}
          className={`
            flex items-center gap-2
            bg-accent-earthy text-white
            rounded-full shadow-lg
            hover:bg-accent-earthy/90 hover:shadow-xl
            transition-all duration-300
            ${isCollapsed ? 'px-3 py-3' : 'px-4 py-3'}
          `}
          aria-label="Open feedback form"
        >
          <MessageSquare className="w-5 h-5" />
          <span
            className={`
              font-medium text-sm whitespace-nowrap
              transition-all duration-300 overflow-hidden
              ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
            `}
          >
            Feedback
          </span>
        </button>
      </div>
    </div>
  );
}

export default PostHogSurveyTrigger;
