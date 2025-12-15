import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMonitoredFetch } from './useMonitoredFetch';
import { monitoredFetch } from '../utils/monitored-fetch';

// Mock react-router
const mockLocation = { pathname: '/products', search: '' };
vi.mock('react-router', () => ({
  useLocation: () => mockLocation,
}));

// Mock monitored-fetch utility
vi.mock('../utils/monitored-fetch', () => ({
  monitoredFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('useMonitoredFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps monitoredFetch correctly', async () => {
    const { result } = renderHook(() => useMonitoredFetch());

    await result.current('/api/test', { label: 'test-fetch' });

    expect(monitoredFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      label: 'test-fetch'
    }));
  });

  it('updates callback when location changes', () => {
    const { result, rerender } = renderHook(() => useMonitoredFetch());
    const firstCallback = result.current;

    mockLocation.pathname = '/checkout';
    rerender();

    const secondCallback = result.current;
    expect(secondCallback).not.toBe(firstCallback);
  });
});
