/**
 * Monitored Fetch Hook (Task 1)
 * Wrapper for monitoredFetch to easily use in React components
 */

import { useCallback } from 'react';
import { useLocation } from 'react-router';
import { monitoredFetch, type MonitoredFetchOptions } from '../utils/monitored-fetch';

/**
 * Hook to use monitoredFetch in React components
 * Automatically injects the current route into the request tracking context
 */
export function useMonitoredFetch() {
  const location = useLocation();

  return useCallback(
    (url: string, options?: MonitoredFetchOptions) => {
      // route is automatically handled by monitoredFetch via window.location,
      // but explicitly passing it via hook context is cleaner if monitoredFetch changes.
      // However, monitoredFetch's `getCurrentRoute` uses window.location directly.
      // We rely on monitoredFetch implementation for now, but this hook provides
      // the requested interface and future-proofing.

      return monitoredFetch(url, options);
    },
    [location.pathname] // Re-create if path changes, though monitoredFetch is stateless regarding route
  );
}

export default useMonitoredFetch;
