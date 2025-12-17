
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckoutForm, CheckoutFormProps } from '../CheckoutForm';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Mock Stripe hooks and elements
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

// Mock Stripe.js load
vi.mock('@stripe/stripe-js', () => ({
    loadStripe: vi.fn(() => Promise.resolve({
        elements: vi.fn(),
        confirmPayment: vi.fn(),
    })),
}));

describe('CheckoutForm', () => {
    const mockStripe = {
        confirmPayment: vi.fn(),
    };
    const mockElements = {
        getElement: vi.fn(),
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

        expect(screen.getByText('Processing...')).toBeInTheDocument();
        
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
            error: { type: 'card_error', message: 'Express payment declined.' }
        });
        
        render(<CheckoutForm {...defaultProps} />);

        const expressButton = screen.getByTestId('express-checkout-button');
        fireEvent.click(expressButton);

        await waitFor(() => {
            expect(screen.getByText('Express payment declined.')).toBeInTheDocument();
        });
    });

    it('handles express checkout submit error', async () => {
        mockElements.submit.mockResolvedValue({ 
            error: { message: 'Validation failed' } 
        });
        
        render(<CheckoutForm {...defaultProps} />);

        const expressButton = screen.getByTestId('express-checkout-button');
        fireEvent.click(expressButton);

        await waitFor(() => {
            expect(screen.getByText('Validation failed')).toBeInTheDocument();
        });
        expect(mockStripe.confirmPayment).not.toHaveBeenCalled();
    });
});
