import { useCallback } from 'react';
import posthog from 'posthog-js';
import { POSTHOG_SURVEY_IDS } from '../utils/posthog';

/**
 * Cooldown configuration for programmatic surveys (in milliseconds)
 */
const SURVEY_COOLDOWNS: Record<string, number> = {
  [POSTHOG_SURVEY_IDS.FEATURE_REQUEST]: 60 * 24 * 60 * 60 * 1000, // 60 days
  [POSTHOG_SURVEY_IDS.ERROR_FEEDBACK]: 24 * 60 * 60 * 1000,       // 24 hours
  [POSTHOG_SURVEY_IDS.BETA_FEEDBACK]: 7 * 24 * 60 * 60 * 1000,    // 7 days
  [POSTHOG_SURVEY_IDS.CSAT]: 7 * 24 * 60 * 60 * 1000,             // 7 days (for exit intent)
};

/**
 * Storage key prefix for survey cooldowns
 */
const COOLDOWN_PREFIX = 'ph_survey_cooldown_';

/**
 * Check if a survey is currently in cooldown period
 */
function isSurveyOnCooldown(surveyId: string): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const key = `${COOLDOWN_PREFIX}${surveyId}`;
    const lastShown = localStorage.getItem(key);

    if (!lastShown) return false;

    const cooldownMs = SURVEY_COOLDOWNS[surveyId] || 24 * 60 * 60 * 1000; // Default 24h
    const elapsed = Date.now() - parseInt(lastShown, 10);

    return elapsed < cooldownMs;
  } catch {
    return false; // If storage fails, allow survey
  }
}

/**
 * Record that a survey was shown (starts cooldown)
 */
function recordSurveyShown(surveyId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const key = `${COOLDOWN_PREFIX}${surveyId}`;
    localStorage.setItem(key, Date.now().toString());
  } catch {
    // Storage access failed - continue without recording
  }
}

/**
 * Type for PostHog client with survey methods
 */
interface PostHogSurveyClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  getActiveMatchingSurveys?: (
    callback: (surveys: Array<{ id: string; name: string }>) => void,
    forceReload?: boolean
  ) => void;
  renderSurvey?: (surveyId: string) => void;
}

/**
 * Extended PostHog client type with feature flag methods
 */
interface PostHogClientExtended extends PostHogSurveyClient {
  featureFlags?: {
    receivedFeatureFlags?: () => boolean;
  };
  onFeatureFlags?: (callback: () => void) => void;
  isFeatureEnabled?: (key: string) => boolean | undefined;
}

/**
 * Wait for PostHog feature flags to be loaded
 * Returns a promise that resolves when flags are ready or times out
 */
function waitForFeatureFlags(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const client = posthog as unknown as PostHogClientExtended;

    // Check if flags are already loaded
    if (client.featureFlags?.receivedFeatureFlags?.()) {
      resolve(true);
      return;
    }

    // Set up timeout
    const timeout = setTimeout(() => {
      console.warn('[PostHog Survey] Feature flags load timeout');
      resolve(false);
    }, timeoutMs);

    // Wait for flags to load
    if (typeof client.onFeatureFlags === 'function') {
      client.onFeatureFlags(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    } else {
      // Fallback: poll for flags
      let attempts = 0;
      const maxAttempts = timeoutMs / 100;
      const poll = setInterval(() => {
        attempts++;
        if (client.featureFlags?.receivedFeatureFlags?.() || attempts >= maxAttempts) {
          clearInterval(poll);
          clearTimeout(timeout);
          resolve(client.featureFlags?.receivedFeatureFlags?.() || false);
        }
      }, 100);
    }
  });
}

/**
 * Trigger a PostHog survey programmatically using the proper API
 * Uses getActiveMatchingSurveys + renderSurvey for proper display
 * Waits for feature flags to be loaded first (required for surveys)
 */
function triggerSurvey(surveyId: string, properties?: Record<string, unknown>): boolean {
  if (typeof window === 'undefined') return false;

  // Check cooldown
  if (isSurveyOnCooldown(surveyId)) {
    console.log('[PostHog Survey] Survey on cooldown:', surveyId);
    return false;
  }

  const client = posthog as unknown as PostHogSurveyClient;

  // Helper to mark cooldown and capture event
  const showSurvey = () => {
    recordSurveyShown(surveyId);
    client.capture('survey shown', {
      $survey_id: surveyId,
      ...properties,
    });
  };

  // Wait for feature flags then render survey
  waitForFeatureFlags().then((flagsLoaded) => {
    if (!flagsLoaded) {
      console.warn('[PostHog Survey] Feature flags not loaded, attempting survey render anyway');
    }

    // Try to use the proper survey rendering API
    if (typeof client.getActiveMatchingSurveys === 'function') {
      client.getActiveMatchingSurveys((surveys) => {
        console.log('[PostHog Survey] Active surveys:', surveys?.map(s => s.name));

        const survey = surveys?.find((s) => s.id === surveyId);
        if (!survey) {
          console.warn('[PostHog Survey] Survey not found in active surveys:', surveyId);
          // Still capture the event as fallback
          showSurvey();
          return;
        }

        // Use renderSurvey if available (PostHog JS SDK method)
        if (typeof client.renderSurvey === 'function') {
          console.log('[PostHog Survey] Rendering survey:', survey.name);
          client.renderSurvey(surveyId);
          recordSurveyShown(surveyId);
        } else {
          console.log('[PostHog Survey] renderSurvey not available, using capture fallback');
          showSurvey();
        }
      }, true); // forceReload = true to get fresh survey list
    } else {
      console.log('[PostHog Survey] getActiveMatchingSurveys not available, using capture fallback');
      showSurvey();
    }
  });

  return true;
}

export interface UsePostHogSurveysReturn {
  /** Trigger the feature request survey */
  triggerFeatureRequest: () => boolean;
  /** Trigger the error feedback survey */
  triggerErrorFeedback: () => boolean;
  /** Trigger beta feedback survey for a specific feature */
  triggerBetaFeedback: (featureName: string) => boolean;
  /** Trigger CSAT survey (used for exit intent) */
  triggerExitIntentSurvey: () => boolean;
  /** Check if a survey is on cooldown */
  isSurveyOnCooldown: (surveyId: string) => boolean;
  /** Survey IDs for reference */
  surveyIds: typeof POSTHOG_SURVEY_IDS;
}

/**
 * Hook for programmatically triggering PostHog surveys
 *
 * Use this hook to trigger API-based surveys that don't use URL targeting:
 * - Feature Request: Triggered from feedback floating button
 * - Error Feedback: Triggered when errors occur
 * - Beta Feedback: Triggered after interacting with beta features
 * - CSAT: Triggered on exit intent (desktop only)
 *
 * @example
 * ```tsx
 * const { triggerFeatureRequest, triggerBetaFeedback } = usePostHogSurveys();
 *
 * // Trigger feature request from a button
 * <button onClick={triggerFeatureRequest}>Give Feedback</button>
 *
 * // Trigger beta feedback after using a beta feature
 * useEffect(() => {
 *   if (usedBetaFeature) {
 *     triggerBetaFeedback('wishlist-v2');
 *   }
 * }, [usedBetaFeature]);
 * ```
 */
export function usePostHogSurveys(): UsePostHogSurveysReturn {
  const triggerFeatureRequest = useCallback(() => {
    return triggerSurvey(POSTHOG_SURVEY_IDS.FEATURE_REQUEST);
  }, []);

  const triggerErrorFeedback = useCallback(() => {
    return triggerSurvey(POSTHOG_SURVEY_IDS.ERROR_FEEDBACK);
  }, []);

  const triggerBetaFeedback = useCallback((featureName: string) => {
    // Use feature-specific cooldown key
    const featureSpecificId = `${POSTHOG_SURVEY_IDS.BETA_FEEDBACK}_${featureName}`;

    // Check feature-specific cooldown
    if (typeof window !== 'undefined') {
      try {
        const key = `${COOLDOWN_PREFIX}${featureSpecificId}`;
        const lastShown = localStorage.getItem(key);

        if (lastShown) {
          const cooldownMs = SURVEY_COOLDOWNS[POSTHOG_SURVEY_IDS.BETA_FEEDBACK];
          const elapsed = Date.now() - parseInt(lastShown, 10);
          if (elapsed < cooldownMs) {
            return false;
          }
        }

        // Record feature-specific cooldown
        localStorage.setItem(key, Date.now().toString());
      } catch {
        // Storage access failed - continue anyway
      }
    }

    posthog.capture('survey shown', {
      $survey_id: POSTHOG_SURVEY_IDS.BETA_FEEDBACK,
      beta_feature_name: featureName,
    });

    return true;
  }, []);

  const triggerExitIntentSurvey = useCallback(() => {
    return triggerSurvey(POSTHOG_SURVEY_IDS.CSAT, {
      trigger_type: 'exit_intent',
    });
  }, []);

  const checkCooldown = useCallback((surveyId: string) => {
    return isSurveyOnCooldown(surveyId);
  }, []);

  return {
    triggerFeatureRequest,
    triggerErrorFeedback,
    triggerBetaFeedback,
    triggerExitIntentSurvey,
    isSurveyOnCooldown: checkCooldown,
    surveyIds: POSTHOG_SURVEY_IDS,
  };
}

export default usePostHogSurveys;
