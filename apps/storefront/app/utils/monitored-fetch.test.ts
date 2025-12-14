// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { monitoredFetch, monitoredPost, monitoredGet } from './monitored-fetch';
import posthog from 'posthog-js';

// Mock posthog-js
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Monitored Fetch (Story 4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset performance.now mock
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)  // Start time
      .mockReturnValueOnce(150); // End time (150ms duration)
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('monitoredFetch', () => {
    it('should capture api_request event on successful request (AC1)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/test');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        url: '/api/test',
        method: 'GET',
        status: 200,
        success: true,
      }));
    });

    it('should include duration in milliseconds (AC1)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/test');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        duration_ms: 150,
      }));
    });

    it('should capture method, URL, and status (AC1)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/orders', { method: 'POST' });

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        method: 'POST',
        status: 201,
        request_path: '/api/orders',
      }));
    });

    it('should capture failed request with error message (AC2)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        clone: () => ({ json: () => Promise.resolve({ error: 'Internal server error' }) }),
      });

      await monitoredFetch('/api/test');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        success: false,
        status: 500,
        error_message: 'Internal server error',
      }));
    });

    it('should capture network errors (AC2)', async () => {
      const networkError = new Error('Network request failed');
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(monitoredFetch('/api/test')).rejects.toThrow('Network request failed');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        success: false,
        status: 0,
        error_message: 'Network request failed',
      }));
    });

    it('should sanitize sensitive query parameters from URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/order?token=secret123&id=order_1');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        url: '/api/order?id=order_1',
      }));
    });

    it('should skip tracking when skipTracking is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/test', { skipTracking: true });

      expect(posthog.capture).not.toHaveBeenCalled();
    });

    it('should include label when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/payment-intent', { 
        method: 'POST',
        label: 'create-payment-intent' 
      });

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        label: 'create-payment-intent',
      }));
    });

    it('should include request_host and request_path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredFetch('/api/shipping-rates');

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        request_path: '/api/shipping-rates',
        request_host: expect.stringContaining('localhost'),
      }));
    });
  });

  describe('monitoredPost', () => {
    it('should send POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      const body = { amount: 1000, currency: 'usd' };
      await monitoredPost('/api/payment-intent', body);

      expect(mockFetch).toHaveBeenCalledWith('/api/payment-intent', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }));

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  describe('monitoredGet', () => {
    it('should send GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      await monitoredGet('/api/products');

      expect(mockFetch).toHaveBeenCalledWith('/api/products', expect.objectContaining({
        method: 'GET',
      }));

      expect(posthog.capture).toHaveBeenCalledWith('api_request', expect.objectContaining({
        method: 'GET',
      }));
    });
  });
});
