import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollTracking } from './useScrollTracking';

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

describe('useScrollTracking', () => {
  let originalScrollY: number;
  let originalInnerHeight: number;
  let originalScrollHeight: number;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup window/document properties
    originalScrollY = window.scrollY;
    originalInnerHeight = window.innerHeight;
    // @ts-expect-error - mock property
    originalScrollHeight = document.documentElement.scrollHeight;

    // Default: 1000px page, 1000px viewport (fully visible)
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 4000, writable: true }); // 4000px total height
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore
    Object.defineProperty(window, 'scrollY', { value: originalScrollY });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: originalScrollHeight });
  });

  it('captures scroll depth at 25%', () => {
    // Start at top: 0 + 1000 / 4000 = 25% viewed immediately
    renderHook(() => useScrollTracking());
    
    // Should trigger initial check
    vi.runAllTimers();
    
    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({
      depth_percentage: 25,
      page_height: 4000,
    }));
    
    // Should not trigger higher milestones yet
    expect(mockCapture).not.toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 50 }));
  });

  it('captures scroll depth progressively', () => {
    renderHook(() => useScrollTracking());
    vi.runAllTimers(); // Clear initial 25%

    mockCapture.mockClear();

    // Scroll to 50%
    // (1000 + 1000) / 4000 = 50%
    Object.defineProperty(window, 'scrollY', { value: 1000 });
    window.dispatchEvent(new Event('scroll'));
    
    vi.runAllTimers();

    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({
      depth_percentage: 50,
    }));
  });

  it('captures multiple milestones at once if scrolled fast', () => {
    Object.defineProperty(window, 'scrollY', { value: 0 }); // Reset
    renderHook(() => useScrollTracking());
    mockCapture.mockClear(); // Clear initial check

    // Scroll directly to 100%
    // (3000 + 1000) / 4000 = 100%
    Object.defineProperty(window, 'scrollY', { value: 3000 });
    window.dispatchEvent(new Event('scroll'));
    
    vi.runAllTimers();

    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 25 }));
    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 50 }));
    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 75 }));
    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 100 }));
  });

  it('does not recapture milestones on the same page', () => {
    renderHook(() => useScrollTracking());
    
    // Scroll to 50%
    Object.defineProperty(window, 'scrollY', { value: 1000 });
    window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    
    mockCapture.mockClear();
    
    // Scroll up and down again
    Object.defineProperty(window, 'scrollY', { value: 0 });
    window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();

    Object.defineProperty(window, 'scrollY', { value: 1000 });
    window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('resets milestones on route change', () => {
    const { rerender } = renderHook(() => useScrollTracking());
    
    // Scroll to 50%
    Object.defineProperty(window, 'scrollY', { value: 1000 });
    window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    
    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({ depth_percentage: 50 }));
    mockCapture.mockClear();

    // Change route
    mockLocation.pathname = '/about';
    // Reset scroll position as browser would
    Object.defineProperty(window, 'scrollY', { value: 0 });
    rerender();
    
    // Scroll to 50% again on new page
    Object.defineProperty(window, 'scrollY', { value: 1000 });
    window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();

    expect(mockCapture).toHaveBeenCalledWith('scroll_depth', expect.objectContaining({
      depth_percentage: 50,
      page_path: '/about'
    }));
  });
});
