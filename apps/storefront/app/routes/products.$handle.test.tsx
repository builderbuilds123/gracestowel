// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProductDetail from './products.$handle';
import { createMockProduct } from '../../tests/factories/product';

// Mock window.matchMedia for JSDOM environment
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock IntersectionObserver for JSDOM environment
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    root = null;
    rootMargin = '';
    thresholds = [];
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {}
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
  Object.defineProperty(global, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
});

// Mock dependencies
const mockPostHog = {
  capture: vi.fn(),
};

vi.mock('../utils/posthog', () => ({
  default: mockPostHog,
}));

// Mock useLoaderData
const mockProduct = createMockProduct();
const mockLoaderData = {
  product: {
    ...mockProduct,
    price: 1000, // cents
    formattedPrice: '$10.00',
    colors: ['White', 'Blue'],
    images: ['test-image.jpg'],
    features: ['Soft', 'Durable'],
    dimensions: '50x100',
    careInstructions: ['Wash Cold'],
    disableEmbroidery: false,
  },
  relatedProducts: [],
  reviews: [],
  reviewStats: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  backendUrl: 'http://localhost:9000',
};

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useLoaderData: () => mockLoaderData,
        Await: ({ children, resolve }: any) => {
             // Simple mock to render children with resolved data immediately/mocked
             return children(resolve); 
        },
        Link: ({ children, to }: any) => <a href={to}>{children}</a>,
    };
});

// Mock Contexts
vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    addToCart: vi.fn(),
    items: [], // Required for cartItems.reduce() in ProductDetail
    cartTotal: 0,
    isOpen: false,
    isLoaded: true,
    toggleCart: vi.fn(), // Required for StickyPurchaseBar onViewCart prop
  }),
  CartProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../context/LocaleContext', () => ({
  useLocale: () => ({ 
    t: (key: string) => key, 
    currency: 'USD',
    formatPrice: (price: number) => `$${(price / 100).toFixed(2)}`
  }),
  LocaleProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../context/CustomerContext', () => ({
  useCustomer: () => ({ customer: null, isAuthenticated: false }),
  CustomerProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../context/WishlistContext', () => ({
    useWishlist: () => ({ isInWishlist: () => false, toggleWishlist: vi.fn() }),
    WishlistProvider: ({ children }: any) => <div>{children}</div>,
}));


describe('ProductDetail Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture product_viewed event on mount', async () => {
    render(<ProductDetail loaderData={mockLoaderData as any} />);

    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledWith('product_viewed', expect.objectContaining({
        product_id: mockLoaderData.product.id,
        product_name: mockLoaderData.product.title,
        product_price: mockLoaderData.product.price,
        product_handle: mockLoaderData.product.handle,
      }));
    });
  });

  it('should only capture product_viewed event once on mount, not on re-renders with same props', async () => {
    const { rerender } = render(<ProductDetail loaderData={mockLoaderData as any} />);

    // It should be called once on initial mount
    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
    });

    // Re-render with the same props
    rerender(<ProductDetail loaderData={mockLoaderData as any} />);

    // Use a small delay to ensure no more calls are made
    await new Promise(r => setTimeout(r, 50));

    // The capture function should still have been called only once
    expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
  });

  it('should re-capture event when product changes (dependency change)', async () => {
    const { rerender } = render(<ProductDetail loaderData={mockLoaderData as any} />);

    // Initial capture
    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
      expect(mockPostHog.capture).toHaveBeenCalledWith('product_viewed', expect.objectContaining({
        product_id: mockLoaderData.product.id,
      }));
    });

    // Change product data (new product ID triggers useEffect dependency)
    const newLoaderData = {
      ...mockLoaderData,
      product: { ...mockLoaderData.product, id: 'different-product-id', handle: 'new-handle' }
    };

    rerender(<ProductDetail loaderData={newLoaderData as any} />);

    // Should capture again with new product ID
    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledTimes(2);
      expect(mockPostHog.capture).toHaveBeenLastCalledWith('product_viewed', expect.objectContaining({
        product_id: 'different-product-id',
        product_handle: 'new-handle',
      }));
    });
  });
});
