// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCheckoutState } from './useCheckoutState';
import type { ShippingOption } from '../components/CheckoutForm';

describe('useCheckoutState', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useCheckoutState());

    expect(result.current.state).toEqual({
      status: 'idle',
      shippingAddress: null,
      email: '',
      shippingOptions: [],
      selectedShippingOption: null,
      paymentCollectionId: null,
      isShippingPersisted: false,
    });
  });

  it('should update status', () => {
    const { result } = renderHook(() => useCheckoutState());

    act(() => {
      result.current.actions.setStatus('initializing');
    });

    expect(result.current.state.status).toBe('initializing');
  });

  it('should set email', () => {
    const { result } = renderHook(() => useCheckoutState());

    act(() => {
      result.current.actions.setEmail('test@example.com');
    });

    expect(result.current.state.email).toBe('test@example.com');
  });

  it('should set shipping address', () => {
    const { result } = renderHook(() => useCheckoutState());
    const address = {
      firstName: 'John',
      lastName: 'Doe',
      address: {
        line1: '123 Main St',
        city: 'NY',
        state: 'NY',
        country: 'US',
        postal_code: '10001'
      },
      phone: '1234567890'
    };

    act(() => {
      result.current.actions.setAddress(address);
    });

    expect(result.current.state.shippingAddress).toEqual(address);
  });

  it('should set and select shipping options', () => {
    const { result } = renderHook(() => useCheckoutState());
    const options: ShippingOption[] = [
      { id: 'opt_1', displayName: 'Standard', amount: 1000 },
      { id: 'opt_2', displayName: 'Express', amount: 2000 }
    ];

    act(() => {
      result.current.actions.setShippingOptions(options);
    });

    expect(result.current.state.shippingOptions).toEqual(options);

    act(() => {
        result.current.actions.selectShippingOption(options[1]);
    });

    expect(result.current.state.selectedShippingOption).toEqual(options[1]);
  });
});
