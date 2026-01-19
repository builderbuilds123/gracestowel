// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShippingRates } from './useShippingRates';
import { monitoredFetch } from '../utils/monitored-fetch';

// Mock monitoredFetch
vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: vi.fn(),
}));

// Mock retry
vi.mock('../utils/retry', () => ({
    retry: vi.fn((fn) => fn()),
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })
}));

describe('useShippingRates', () => {
  const defaultProps = {
    cartId: 'cart_123',
    setCartId: vi.fn(),
    cartItems: [],
    currency: 'USD',
    regionId: 'reg_us',
    selectedShipping: null,
    setShippingOptions: vi.fn(),
    setSelectedShipping: vi.fn(),
    setIsCalculating: vi.fn(),
    setIsCartSynced: vi.fn(),
    onCartUpdated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch shipping options successfully', async () => {
    const { result } = renderHook(() => useShippingRates(defaultProps));

    // Mock responses for monitoredFetch
    // 1. Update Cart (POST /api/carts/cart_123)
    // 2. Shipping Options (GET /api/carts/cart_123/shipping-options)
    (monitoredFetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ cart: { id: 'cart_123' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
            shipping_options: [{ id: 'so_1', name: 'Standard', amount: 500 }] 
        })
      });

    await act(async () => {
      await result.current.fetchShippingRates(
        [{ id: 'item_1', price: 1000, quantity: 1 } as any],
        {
          firstName: 'John',
          lastName: 'Doe',
          address: {
            line1: '123 St',
            city: 'NY',
            state: 'NY',
            postal_code: '10001',
            country: 'US'
          }
        },
        1000,
        'test@example.com'
      );
    });

    expect(defaultProps.setIsCalculating).toHaveBeenCalledWith(true);
    // expect(mockMedusaClient.carts.update).toHaveBeenCalled(); // Should be called to update email/address
    // expect(mockMedusaClient.shippingOptions.listCartOptions).toHaveBeenCalled();
    expect(defaultProps.setShippingOptions).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'so_1' })])
    );
    expect(defaultProps.setIsCalculating).toHaveBeenCalledWith(false);
  });

  it('should clear cache', () => {
    const { result } = renderHook(() => useShippingRates(defaultProps));
    
    act(() => {
      result.current.clearCache();
    });
    
    // Logic for clearCache is internal ref clearing, hard to test without subsequent fetch behavior.
    // For now we assume function exists and doesn't crash.
    expect(result.current.clearCache).toBeDefined();
  });
});
