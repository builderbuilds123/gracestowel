// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Checkout from './checkout';

// Mock PostHog
const mockPostHog = {
  capture: vi.fn(),
};

vi.mock('../utils/posthog', () => ({
  default: mockPostHog,
}));

// Mock Dependencies
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div>{children}</div>,
  ExpressCheckoutElement: () => <div>Express Checkout</div>,
}));

vi.mock('../lib/stripe', () => ({
  getStripe: () => Promise.resolve(null),
  initStripe: vi.fn(),
}));

vi.mock('../lib/price', () => ({
    parsePrice: (p: any) => Number(p),
}));

// Mock Children
vi.mock('../components/CheckoutForm', () => ({
    CheckoutForm: () => <div>Checkout Form</div>,
}));
vi.mock('../components/OrderSummary', () => ({
    OrderSummary: () => <div>Order Summary</div>,
}));

// Mock Contexts - we will use vi.fn() to allow overriding in tests if needed
const mockUseCart = vi.fn();
vi.mock('../context/CartContext', () => ({
  useCart: () => mockUseCart(),
}));

vi.mock('../context/LocaleContext', () => ({
  useLocale: () => ({ currency: 'USD' }),
}));

vi.mock('../context/CustomerContext', () => ({
  useCustomer: () => ({ customer: null, isAuthenticated: false }),
  getAuthToken: () => null,
}));

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        Link: ({ children }: any) => <a>{children}</a>,
        useLoaderData: () => ({ stripePublishableKey: 'pk_test_mock' }),
    };
});

// Mock hooks
const mockPersistShippingOption = vi.fn();
vi.mock('../hooks/useShippingPersistence', () => ({
    useShippingPersistence: () => ({
        isShippingPersisted: true,
        setIsShippingPersisted: vi.fn(),
        shippingPersistError: null,
        setShippingPersistError: vi.fn(),
        persistShippingOption: mockPersistShippingOption
    }),
}));


describe('Checkout Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock implementation
        mockUseCart.mockReturnValue({
            items: [],
            cartTotal: 0,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock fetch for payment-intent
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            json: () => Promise.resolve({ clientSecret: 'test_secret' }),
        } as any)));
    });

    it('should fire checkout_started when cart loads (late load scenario)', async () => {
        // Initial render: Cart is empty/loading (total 0)
        mockUseCart.mockReturnValue({
            items: [],
            cartTotal: 0,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });
        
        const { rerender } = render(<Checkout />);
        
        // Should NOT fire yet
        // Should NOT fire yet
        expect(mockPostHog.capture).not.toHaveBeenCalled();
        expect(mockPostHog.capture).not.toHaveBeenCalled();

        // Second render: Cart loaded
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });
        
        rerender(<Checkout />);
        
        // Should fire now
        await waitFor(() => {
            expect(mockPostHog.capture).toHaveBeenCalledWith('checkout_started', expect.objectContaining({
                cart_total: 1000,
            }));
        });
    });

    it('should fire only once even if cart updates (e.g. quantity change)', async () => {
         // Setup: Cart already loaded
         mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        const { rerender } = render(<Checkout />);

        await waitFor(() => {
            expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
        });

        // Update cart (e.g. quantity increase)
         mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 2 }],
            cartTotal: 2000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        rerender(<Checkout />);

        // Should NOT fire again
        await waitFor(() => {}, { timeout: 100 });
        expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
    });
});
