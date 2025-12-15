import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEngagementTracking } from './useEngagementTracking';

// Mock react-router
const mockLocation = { pathname: '/products', search: '' };
vi.mock('react-router', () => ({
  useLocation: () => mockLocation,
}));

// Mock posthog
const mockCapture = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => mockCapture(...args),
  },
}));

describe('useEngagementTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures engagement event on unmount/route change', () => {
    const { unmount } = renderHook(() => useEngagementTracking());

    // Simulate some time passing (active)
    vi.advanceTimersByTime(5000);

    unmount();
    
    expect(mockCapture).toHaveBeenCalledWith('page_engagement', expect.objectContaining({
      page_path: '/products',
      engaged_time_ms: expect.any(Number),
      total_time_ms: expect.any(Number),
    }));
    
    // Check values roughly
    const call = mockCapture.mock.calls[0][1];
    expect(call.engaged_time_ms).toBeGreaterThanOrEqual(4900);
    expect(call.idle_time_ms).toBe(0);
  });

  it('tracks idle time after threshold', () => {
    const { unmount } = renderHook(() => useEngagementTracking());

    // Active for 1s
    vi.advanceTimersByTime(1000);

    // Go idle (wait 30s + 5s idle)
    // The threshold is 30s.
    // So if we wait 35s total without activity:
    // 0-30s: Active (assumed active until timeout fires)?
    // Wait, the logic is: idleTimer fires after 30s of NO activity.
    // So if we do nothing for 35s:
    // 0-30s: Was "engaged" waiting for timeout?
    // Actually, usually "idle time" counts the time *after* the threshold.
    // But implementation details vary.
    // In my implementation:
    // Initial: active. Timer set for 30s.
    // ... 30s pass ...
    // Timer fires: tick() adds 30s to engagedTime. isIdle = true.
    // ... 5s pass ...
    // Unmount: tick() adds 5s to idleTime.
    
    vi.advanceTimersByTime(35000);
    
    unmount();
    
    expect(mockCapture).toHaveBeenCalledWith('page_engagement', expect.objectContaining({
      engaged_time_ms: 30000,
      idle_time_ms: 6000,
      total_time_ms: 36000,
    }));
  });

  it('resets idle timer on activity', () => {
    const { unmount } = renderHook(() => useEngagementTracking());
    
    // Wait 20s (Active: 20s)
    vi.advanceTimersByTime(20000);
    
    // User moves mouse
    window.dispatchEvent(new Event('mousemove'));
    
    // Wait 20s (Active: 20s + 20s = 40s).
    // Because activity at 20s reset the 30s timer.
    vi.advanceTimersByTime(20000);
    
    unmount();
    
    expect(mockCapture).toHaveBeenCalledWith('page_engagement', expect.objectContaining({
      engaged_time_ms: 40000,
      idle_time_ms: 0,
    }));
  });

  it('switches back to engaged from idle on activity', () => {
    const { unmount } = renderHook(() => useEngagementTracking());
    
    // Wait 35s (Active: 30s, Idle: 5s)
    vi.advanceTimersByTime(35000);
    
    // User clicks
    window.dispatchEvent(new Event('mousedown'));
    
    // Wait 5s (Active: 30s + 5s, Idle: 5s)
    vi.advanceTimersByTime(5000);

    unmount();

    expect(mockCapture).toHaveBeenCalledWith('page_engagement', expect.objectContaining({
      engaged_time_ms: 35000, // 30s initial + 5s after click
      idle_time_ms: 5000,     // 5s while idle
    }));
  });
});
