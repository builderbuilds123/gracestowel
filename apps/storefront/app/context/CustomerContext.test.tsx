// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerProvider, useCustomer } from './CustomerContext';

// Mock PostHog
const mockPostHogIdentify = vi.fn();
const mockPostHogReset = vi.fn();

vi.mock('../utils/posthog', () => ({
  default: {
    identify: mockPostHogIdentify,
    reset: mockPostHogReset,
    capture: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component that uses the customer context
function TestConsumer({ onCustomerChange }: { onCustomerChange?: (customer: any) => void }) {
  const { customer, isAuthenticated, isLoading, login, logout } = useCustomer();
  
  if (onCustomerChange && customer) {
    onCustomerChange(customer);
  }
  
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="customer-id">{customer?.id || 'none'}</div>
      <button data-testid="login-btn" onClick={() => login('test@example.com', 'password')}>
        Login
      </button>
      <button data-testid="logout-btn" onClick={() => logout()}>
        Logout
      </button>
    </div>
  );
}

describe('CustomerContext PostHog Integration (Story 2.2)', () => {
  const mockCustomer = {
    id: 'cust_medusa_12345',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    created_at: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('posthog.identify() on login (AC1, AC2, AC3)', () => {
    it('should call posthog.identify with customer.id when customer data is fetched', async () => {
      // Mock successful auth response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'test_token_123' }),
        })
        // Mock customer fetch response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ customer: mockCustomer }),
        });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Trigger login
      const loginBtn = screen.getByTestId('login-btn');
      await act(async () => {
        await userEvent.click(loginBtn);
      });

      // Wait for customer to be loaded and PostHog to be called
      await waitFor(() => {
        expect(mockPostHogIdentify).toHaveBeenCalledWith(
          'cust_medusa_12345',
          expect.objectContaining({
            email: 'test@example.com',
            first_name: 'John',
            last_name: 'Doe',
            created_at: '2024-01-01T00:00:00.000Z',
          })
        );
      });
    });

    it('should use Medusa customer ID as distinct_id (AC3)', async () => {
      // Setup: simulate existing token in localStorage
      localStorage.setItem('medusa_customer_token', 'existing_token');
      
      // Mock customer fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customer: mockCustomer }),
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      // Wait for PostHog identify to be called
      await waitFor(() => {
        expect(mockPostHogIdentify).toHaveBeenCalled();
      });

      // Verify the first argument (distinct_id) is the Medusa customer ID
      const [distinctId] = mockPostHogIdentify.mock.calls[0];
      expect(distinctId).toBe('cust_medusa_12345');
      expect(distinctId).toMatch(/^cust_/); // Medusa customer ID format
    });

    it('should send user properties (email, first_name, last_name, created_at) to PostHog', async () => {
      localStorage.setItem('medusa_customer_token', 'existing_token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customer: mockCustomer }),
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      await waitFor(() => {
        expect(mockPostHogIdentify).toHaveBeenCalled();
      });

      const [, properties] = mockPostHogIdentify.mock.calls[0];
      expect(properties).toEqual({
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        created_at: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should NOT call posthog.identify if customer fetch fails', async () => {
      localStorage.setItem('medusa_customer_token', 'invalid_token');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // PostHog identify should NOT have been called
      expect(mockPostHogIdentify).not.toHaveBeenCalled();
    });
  });

  describe('posthog.reset() on logout (AC1)', () => {
    it('should call posthog.reset when user logs out', async () => {
      // Setup: User is logged in
      localStorage.setItem('medusa_customer_token', 'existing_token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customer: mockCustomer }),
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      // Wait for customer to load
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      });

      // Clear mocks to isolate logout behavior
      mockPostHogReset.mockClear();

      // Trigger logout
      const logoutBtn = screen.getByTestId('logout-btn');
      await act(async () => {
        await userEvent.click(logoutBtn);
      });

      // Verify posthog.reset was called
      await waitFor(() => {
        expect(mockPostHogReset).toHaveBeenCalled();
      });
    });

    it('should clear customer state and PostHog identification on logout', async () => {
      localStorage.setItem('medusa_customer_token', 'existing_token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customer: mockCustomer }),
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      // Wait for authenticated state
      await waitFor(() => {
        expect(screen.getByTestId('customer-id')).toHaveTextContent('cust_medusa_12345');
      });

      // Logout
      const logoutBtn = screen.getByTestId('logout-btn');
      await act(async () => {
        await userEvent.click(logoutBtn);
      });

      // Verify state cleared
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
        expect(screen.getByTestId('customer-id')).toHaveTextContent('none');
      });

      // Verify PostHog reset called
      expect(mockPostHogReset).toHaveBeenCalled();
      
      // Verify localStorage cleared
      expect(localStorage.getItem('medusa_customer_token')).toBeNull();
    });
  });

  describe('Anonymous ID aliasing (AC4)', () => {
    /**
     * PostHog's identify() automatically handles aliasing:
     * - When identify(distinctId) is called, PostHog links the current anonymous ID
     *   to the provided distinctId
     * - All previous events under the anonymous ID are retroactively associated
     * - No explicit alias() call is needed
     * 
     * Reference: https://posthog.com/docs/product-analytics/identify
     */
    it('should call identify() which automatically aliases anonymous ID to customer ID', async () => {
      localStorage.setItem('medusa_customer_token', 'existing_token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customer: mockCustomer }),
      });

      render(
        <CustomerProvider>
          <TestConsumer />
        </CustomerProvider>
      );

      await waitFor(() => {
        expect(mockPostHogIdentify).toHaveBeenCalled();
      });

      // The identify() call itself handles aliasing - verify it was called correctly
      // PostHog SDK internally: alias(anonymousId, distinctId) + set distinctId
      expect(mockPostHogIdentify).toHaveBeenCalledTimes(1);
      expect(mockPostHogIdentify).toHaveBeenCalledWith(
        'cust_medusa_12345', // New distinct_id (customer ID)
        expect.any(Object)   // Properties
      );
    });
  });
});
