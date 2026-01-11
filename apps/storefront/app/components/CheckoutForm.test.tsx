
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Declare ALL mocks at the very top
vi.mock('@stripe/react-stripe-js', async () => {
    const actual = await vi.importActual('@stripe/react-stripe-js');
    return {
        ...actual,
        useStripe: vi.fn(),
        useElements: vi.fn(),
        PaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
        LinkAuthenticationElement: () => <div data-testid="link-authentication-element">Link Auth Element</div>,
        AddressElement: () => <div data-testid="address-element">Address Element</div>,
        ExpressCheckoutElement: ({ onConfirm }: any) => (
            <div data-testid="express-checkout-element">
                <button type="button" onClick={() => onConfirm({})} data-testid="express-checkout-button">
                    Express Checkout
                </button>
            </div>
        ),
    };
});

vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: vi.fn(async () => {
        // Add a small delay to simulate network and ensure "Processing..." state is visible
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
            ok: true,
            json: () => Promise.resolve({
                success: true,
                payment_collection: {
                    payment_sessions: [
                        {
                            provider_id: "pp_stripe",
                            data: {
                                client_secret: "new_secret"
                            }
                        }
                    ]
                }
            }),
        };
    }),
}));

vi.mock('@stripe/stripe-js', () => ({
    loadStripe: vi.fn(() => Promise.resolve({
        elements: vi.fn(),
        confirmPayment: vi.fn(),
    })),
}));

// 2. ONLY THEN import React and components
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckoutForm } from './CheckoutForm';
import type { CheckoutFormProps } from './CheckoutForm';
import { loadStripe } from '@stripe/stripe-js';


describe('CheckoutForm', () => {
    const mockStripe = {
        confirmPayment: vi.fn(),
    };
    const mockElements = {
        getElement: vi.fn().mockReturnValue({
            getValue: vi.fn().mockResolvedValue({
                complete: true,
                value: {
                    name: 'John Doe',
                    address: {
                        line1: '123 Test St',
                        city: 'Test City',
                        state: 'TS',
                        postal_code: '12345',
                        country: 'US'
                    },
                    phone: '1234567890'
                }
            })
        }),
        submit: vi.fn().mockResolvedValue({ error: null }),
    };

    const defaultProps: CheckoutFormProps = {
        items: [{ 
            id: 'item_1', 
            image: 'thumb.jpg', 
            title: 'Test Towel', 
            quantity: 1, 
            price: '$20.00',
            variantId: 'var_1',
            color: 'Blue'
        }],
        cartTotal: 2000,
        shippingOptions: [
            { id: 'standard', displayName: 'Standard', amount: 5, deliveryEstimate: '3-5 days' },
            { id: 'express', displayName: 'Express', amount: 15, deliveryEstimate: '1-2 days' }
        ],
        selectedShipping: { id: 'standard', displayName: 'Standard', amount: 5 },
        setSelectedShipping: vi.fn(),
        onAddressChange: vi.fn(),
        persistShippingOption: vi.fn().mockResolvedValue(undefined),
        cartId: 'cart_123',
        paymentCollectionId: 'pay_col_123',
        customerData: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            address: {
                line1: '123 Test St',
                city: 'Test City',
                state: 'TS',
                postal_code: '12345',
                country: 'US'
            }
        }
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        mockStripe.confirmPayment.mockResolvedValue({ error: null });
        mockElements.submit.mockResolvedValue({ error: null });

        const { useStripe, useElements } = await import('@stripe/react-stripe-js');
        (useStripe as any).mockReturnValue(mockStripe);
        (useElements as any).mockReturnValue(mockElements);

        // Mock window.location
        Object.defineProperty(window, 'location', {
            value: {
                origin: 'http://localhost:3000',
                href: 'http://localhost:3000',
            },
            writable: true,
        });

        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            clear: vi.fn(),
        };
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    });

    it('renders all sections correctly', () => {
        render(<CheckoutForm {...defaultProps} />);

        expect(screen.getByText('Contact')).toBeInTheDocument();
        expect(screen.getByTestId('link-authentication-element')).toBeInTheDocument();
        
        expect(screen.getByText('Delivery')).toBeInTheDocument();
        expect(screen.getByTestId('address-element')).toBeInTheDocument();
        expect(screen.getByText('Shipping method')).toBeInTheDocument();
        
        expect(screen.getByText('Payment')).toBeInTheDocument();
        expect(screen.getByTestId('payment-element')).toBeInTheDocument();
        
        expect(screen.getByText('Pay now')).toBeInTheDocument();
    });

    it('displays shipping options correctly', () => {
        render(<CheckoutForm {...defaultProps} />);

        expect(screen.getByText('Standard')).toBeInTheDocument();
        expect(screen.getByText('$5.00')).toBeInTheDocument();
        expect(screen.getByText('3-5 days')).toBeInTheDocument();

        expect(screen.getByText('Express')).toBeInTheDocument();
        expect(screen.getByText('$15.00')).toBeInTheDocument();
        expect(screen.getByText('1-2 days')).toBeInTheDocument();
    });

    it('handles shipping selection', () => {
        render(<CheckoutForm {...defaultProps} />);

        const expressOption = screen.getByText('Express');
        fireEvent.click(expressOption);

        expect(defaultProps.setSelectedShipping).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'express' })
        );
    });

    it('handles payment submission success', async () => {
        mockStripe.confirmPayment.mockResolvedValue({ error: null });
        
        render(<CheckoutForm {...defaultProps} />);

        const submitButton = screen.getByRole('button', { name: /pay now/i });
        fireEvent.click(submitButton);

        // Use findByText to wait for the state transition
        expect(await screen.findByText('Processing...')).toBeInTheDocument();
        
        await waitFor(() => {
            expect(mockStripe.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({
                confirmParams: {
                    return_url: expect.stringContaining('/checkout/success'),
                },
            }));
        });
        
        await waitFor(() => {
            expect(screen.getByText('Pay now')).toBeInTheDocument();
        });
    });

    it('handles payment submission error', async () => {
        mockStripe.confirmPayment.mockResolvedValue({
            error: { type: 'card_error', message: 'Your card was declined.' }
        });

        render(<CheckoutForm {...defaultProps} />);

        const submitButton = screen.getByRole('button', { name: /pay now/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Your card was declined.')).toBeInTheDocument();
        });
    });

    it('disables submit button when stripe is not loaded', async () => {
        const { useStripe } = await import('@stripe/react-stripe-js');
        (useStripe as any).mockReturnValue(null);

        render(<CheckoutForm {...defaultProps} />);

        const submitButton = screen.getByRole('button', { name: /pay now/i });
        expect(submitButton).toBeDisabled();
    });

    it('disables submit button when elements is not loaded', async () => {
        const { useElements } = await import('@stripe/react-stripe-js');
        (useElements as any).mockReturnValue(null);

        render(<CheckoutForm {...defaultProps} />);

        const submitButton = screen.getByRole('button', { name: /pay now/i });
        expect(submitButton).toBeDisabled();
    });

    it('handles express checkout confirmation', async () => {
        mockStripe.confirmPayment.mockResolvedValue({ error: null });
        
        render(<CheckoutForm {...defaultProps} />);

        const expressButton = screen.getByTestId('express-checkout-button');
        fireEvent.click(expressButton);

        await waitFor(() => {
            expect(mockElements.submit).toHaveBeenCalled();
            expect(mockStripe.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({
                confirmParams: expect.objectContaining({
                    return_url: expect.stringContaining('/checkout/success'),
                }),
            }));
        });
    });

    it('handles express checkout error', async () => {
        mockStripe.confirmPayment.mockResolvedValue({
            error: { type: 'card_error', message: 'The payment was not successful. Please try again.' } 
        });
        
        render(<CheckoutForm {...defaultProps} />);

        const expressButton = screen.getByTestId('express-checkout-button');
        fireEvent.click(expressButton);

        await waitFor(() => {
            expect(screen.getByText('The payment was not successful. Please try again.')).toBeInTheDocument();
        });
    });

    it('handles express checkout submit error', async () => {
        mockElements.submit.mockResolvedValue({ 
            error: { message: 'Please check your payment information.' } 
        });
        
        render(<CheckoutForm {...defaultProps} />);

        const expressButton = screen.getByTestId('express-checkout-button');
        fireEvent.click(expressButton);

        await waitFor(() => {
            expect(screen.getByText('Please check your payment information.')).toBeInTheDocument();
        });
        expect(mockStripe.confirmPayment).not.toHaveBeenCalled();
    });
});
