import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavigationTracking } from './useNavigationTracking';

// Mock react-router
const mockLocation = { pathname: '/products', search: '' };
const mockNavigationType = 'PUSH';

vi.mock('react-router', () => ({
  useLocation: () => mockLocation,
  useNavigationType: () => mockNavigationType,
}));

// Mock posthog
const mockCapture = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => mockCapture(...args),
  },
}));

describe('useNavigationTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not capture event on initial render', () => {
    renderHook(() => useNavigationTracking());
    
    // Initial render should not capture navigation event
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('captures navigation event when path changes', async () => {
    const { rerender } = renderHook(() => useNavigationTracking());
    
    // Initial render - no capture
    expect(mockCapture).not.toHaveBeenCalled();
    
    // Simulate navigation by changing location
    mockLocation.pathname = '/checkout';
    
    // Advance time to simulate user spending time on first page
    vi.advanceTimersByTime(5000);
    
    rerender();
    
    // Should capture navigation event
    expect(mockCapture).toHaveBeenCalledWith('navigation', expect.objectContaining({
      from_path: '/products',
      to_path: '/checkout',
      navigation_type: 'link',
    }));
  });

  it('includes time spent on previous page', () => {
    const { rerender } = renderHook(() => useNavigationTracking());
    
    // Advance time
    vi.advanceTimersByTime(3000);
    
    // Change path
    mockLocation.pathname = '/about';
    rerender();
    
    expect(mockCapture).toHaveBeenCalledWith('navigation', expect.objectContaining({
      time_on_previous_page_ms: expect.any(Number),
    }));
  });
});
