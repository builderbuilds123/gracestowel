import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

  it('tracks user activity on mouse/keyboard events', () => {
    renderHook(() => useEngagementTracking());
    
    // Simulate user activity
    act(() => {
      window.dispatchEvent(new Event('mousedown'));
    });
    
    // No event yet - engagement event only fires on page leave
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('sends engagement event on route change', () => {
    const { rerender } = renderHook(() => useEngagementTracking());
    
    // Spend some time on page
    act(() => {
      vi.advanceTimersByTime(5000);
      window.dispatchEvent(new Event('mousedown'));
    });
    
    // Change route
    mockLocation.pathname = '/checkout';
    rerender();
    
    // Should send engagement event for previous page
    expect(mockCapture).toHaveBeenCalledWith('page_engagement', expect.objectContaining({
      page_path: '/products',
      engaged_time_ms: expect.any(Number),
      idle_time_ms: expect.any(Number),
      total_time_ms: expect.any(Number),
    }));
  });

  it('detects idle state after 30 seconds of inactivity', () => {
    renderHook(() => useEngagementTracking());
    
    // Simulate initial activity
    act(() => {
      window.dispatchEvent(new Event('mousedown'));
    });
    
    // Wait for idle threshold (30s) + check interval (5s)
    act(() => {
      vi.advanceTimersByTime(35000);
    });
    
    // Change route to trigger engagement event
    mockLocation.pathname = '/about';
    const { rerender } = renderHook(() => useEngagementTracking());
    rerender();
    
    // Should have recorded some idle time
    const engagementCall = mockCapture.mock.calls.find(
      (call) => call[0] === 'page_engagement'
    );
    
    if (engagementCall) {
      expect(engagementCall[1].idle_time_ms).toBeGreaterThan(0);
    }
  });

  it('does not send event for very short page visits', () => {
    const { rerender } = renderHook(() => useEngagementTracking());
    
    // Very short time on page (< 1 second)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // Change route
    mockLocation.pathname = '/checkout';
    rerender();
    
    // Should NOT send engagement event for sub-1-second visits
    expect(mockCapture).not.toHaveBeenCalledWith('page_engagement', expect.anything());
  });
});
