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
    toCents: (amount: number) => Math.round(amount * 100),
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

        // Mock fetch for payment-collections API (Medusa v2 payment flow)
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            json: () => Promise.resolve({ payment_collection: { id: 'paycol_test', payment_sessions: [{ provider_id: 'pp_stripe', data: { client_secret: 'test_secret' } }] } }),
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

describe('Checkout Payment Collection Flow', () => {
    const mockFetch = vi.fn();
    
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
        
        // Mock sessionStorage
        const sessionStorageMock = {
            getItem: vi.fn(() => 'cart_01HTEST123'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        vi.stubGlobal('sessionStorage', sessionStorageMock);
    });

    it('should call payment-collections API when cart is synced', async () => {
        // Setup: Valid cart with items
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock the payment collection flow responses
        // Mock cart sync API calls (Update, Options) followed by Payment Collection/Session
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ cart_id: 'cart_01HTEST123' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    shipping_options: [],
                    cart_id: 'cart_01HTEST123'
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ payment_collection: { id: 'paycol_test123' } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    payment_collection: {
                        payment_sessions: [{
                            provider_id: 'pp_stripe',
                            data: { client_secret: 'pi_test_secret', id: 'pi_test123' }
                        }]
                    }
                }),
            });

        render(<Checkout />);

        // Payment collections should be called (after debounce)
        await waitFor(() => {
            const calls = mockFetch.mock.calls;
            const paymentCollectionCall = calls.find((call: any) => 
                call[0]?.includes?.('/api/payment-collections') || 
                (typeof call[0] === 'string' && call[0].includes('/api/payment-collections'))
            );
            // The API may not be called immediately due to isCartSynced state
            expect(paymentCollectionCall).toBeDefined();
        }, { timeout: 2000 });
    });

    it('should handle payment collection creation failure gracefully', async () => {
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock failed payment collection creation
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Internal server error' }),
        });

        const { container } = render(<Checkout />);

        // Should render without crashing
        expect(container).toBeTruthy();
    });

    it('should handle payment session creation failure gracefully', async () => {
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock successful collection, failed session
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ payment_collection: { id: 'paycol_test123' } }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'Session creation failed' }),
            });

        const { container } = render(<Checkout />);

        // Should render without crashing
        expect(container).toBeTruthy();
    });
});

describe('Express Checkout with Payment Collections', () => {
    const mockFetch = vi.fn();
    
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
        
        // Mock sessionStorage
        const sessionStorageMock = {
            getItem: vi.fn(() => 'cart_01HTEST123'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        vi.stubGlobal('sessionStorage', sessionStorageMock);
    });

    it('should initialize Payment Collection before Express Checkout can be used', async () => {
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock cart sync API calls (happens first)
        // Mock cart sync API calls (Updated: Create Cart skipped due to session)
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ cart_id: 'cart_01HTEST123' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    shipping_options: [],
                    cart_id: 'cart_01HTEST123'
                }),
            })
            // Mock successful payment collection and session creation
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    payment_collection: { id: 'paycol_test123' } 
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    payment_collection: {
                        payment_sessions: [{
                            provider_id: 'pp_stripe',
                            data: { 
                                client_secret: 'pi_test_secret_123',
                                id: 'pi_test123'
                            }
                        }]
                    }
                }),
            });

        render(<Checkout />);

        // Wait for payment collection to be initialized
        await waitFor(() => {
            const calls = mockFetch.mock.calls;
            const paymentCollectionCall = calls.find((call: any) => {
                const url = typeof call[0] === 'string' ? call[0] : (call[0]?.url || call[0]?.[0] || '');
                const method = call[0]?.method || call[1]?.method || 'GET';
                return url.includes('/api/payment-collections') && 
                       !url.includes('/sessions') &&
                       method === 'POST';
            });
            expect(paymentCollectionCall).toBeDefined();
        }, { timeout: 2000 });

        // Verify payment session was created
        await waitFor(() => {
            const calls = mockFetch.mock.calls;
            const sessionCall = calls.find((call: any) => {
                const url = typeof call[0] === 'string' ? call[0] : (call[0]?.url || call[0]?.[0] || '');
                const method = call[0]?.method || call[1]?.method || 'GET';
                return url.includes('/api/payment-collections') && 
                       url.includes('/sessions') &&
                       method === 'POST';
            });
            expect(sessionCall).toBeDefined();
        }, { timeout: 2000 });
    });

    it('should handle Express Checkout when Payment Collection initialization fails', async () => {
        mockUseCart.mockReturnValue({
            items: [{ id: '1', title: 'Towel', price: 1000, quantity: 1 }],
            cartTotal: 1000,
            updateQuantity: vi.fn(),
            removeFromCart: vi.fn(),
        });

        // Mock cart sync API calls
        // Mock cart sync API calls (Updated: Create Cart skipped due to session)
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ cart_id: 'cart_01HTEST123' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    shipping_options: [],
                    cart_id: 'cart_01HTEST123'
                }),
            })
            // Mock payment collection creation failure
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'Payment collection creation failed' }),
            });

        const { container } = render(<Checkout />);

        // Should render without crashing even if payment collection fails
        // Express Checkout should still be available (it will handle its own initialization)
        await waitFor(() => {
            expect(container).toBeTruthy();
        }, { timeout: 2000 });
    });
});
