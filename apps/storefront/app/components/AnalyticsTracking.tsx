/**
 * Analytics Tracking Component (Story 5.2.6)
 * Wraps all tracking hooks in a single component
 * Must be rendered within router context
 */

import {
  useNavigationTracking,
  useScrollTracking,
  useEngagementTracking,
  useFormTracking
} from "../hooks";

export function AnalyticsTracking() {
  useNavigationTracking();
  useScrollTracking();
  useEngagementTracking();
  useFormTracking();
  return null;
}

export default AnalyticsTracking;
