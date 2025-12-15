import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollTracking } from './useScrollTracking';

// Mock react-router
const mockLocation = { pathname: '/products/towel-1', search: '' };

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

describe('useScrollTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock window scroll properties
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2000,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 500,
      writable: true,
    });
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks scroll depth on initial render after delay', () => {
    renderHook(() => useScrollTracking());
    
    // Before delay - no capture
    expect(mockCapture).not.toHaveBeenCalled();
    
    // After initial check delay
    act(() => {
      vi.advanceTimersByTime(150);
    });
    
    // At 0 scroll, no milestone reached
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('captures 25% scroll milestone', () => {
    renderHook(() => useScrollTracking());
    
    // Initial delay
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Simulate scrolling to 25%
    Object.defineProperty(window, 'scrollY', { value: 375 }); // 375 / 1500 = 25%

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      // RAF callback
      vi.advanceTimersByTime(20);
    });

    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({
      depth_percentage: 25,
      page_path: '/products/towel-1',
    }));
  });

  it('captures each milestone only once per page', () => {
    renderHook(() => useScrollTracking());
    
    act(() => {
      vi.advanceTimersByTime(150);
    });
    
    // Scroll to 25%
    Object.defineProperty(window, 'scrollY', { value: 375 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    
    const callCount = mockCapture.mock.calls.length;
    
    // Scroll again within same range
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    // Should not have captured again
    expect(mockCapture.mock.calls.length).toBe(callCount);
  });

  it('resets milestones on route change', () => {
    const { rerender } = renderHook(() => useScrollTracking());
    
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Scroll to 25%
    Object.defineProperty(window, 'scrollY', { value: 375 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(mockCapture).toHaveBeenCalledTimes(1);
    
    // Change route
    mockLocation.pathname = '/products/towel-2';
    rerender();
    
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Scroll again - should capture for new page
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(mockCapture).toHaveBeenCalledTimes(2);
  });
});
