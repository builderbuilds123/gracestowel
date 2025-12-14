import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormTracking } from './useFormTracking';

// Mock react-router
const mockLocation = { pathname: '/checkout', search: '' };

vi.mock('react-router', () => ({
  useLocation: () => mockLocation,
}));

// Mock posthog
const mockCapture = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => mockCapture(...args),
  },
}));

describe('useFormTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tracks focus events on input fields', () => {
    // Create a form with an input
    document.body.innerHTML = `
      <form id="checkout-form">
        <input type="text" name="email" />
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const input = document.querySelector('input[name="email"]') as HTMLInputElement;
    
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'checkout_form',
      field_name: 'email',
      interaction_type: 'focus',
      page_path: '/checkout',
    }));
  });

  it('tracks blur events on input fields', () => {
    document.body.innerHTML = `
      <form id="checkout-form">
        <input type="text" name="city" value="Toronto" />
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const input = document.querySelector('input[name="city"]') as HTMLInputElement;
    
    // Need to mock validity
    Object.defineProperty(input, 'validity', {
      value: { valid: true },
      writable: true,
    });
    
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      field_name: 'city',
      interaction_type: 'blur',
    }));
  });

  it('masks sensitive field names', () => {
    document.body.innerHTML = `
      <form id="payment-form">
        <input type="password" name="password" />
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const input = document.querySelector('input[name="password"]') as HTMLInputElement;
    
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      field_name: '[sensitive]',
    }));
  });

  it('tracks form submission', () => {
    document.body.innerHTML = `
      <form id="checkout-form">
        <input type="text" name="email" />
        <button type="submit">Submit</button>
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const form = document.querySelector('form') as HTMLFormElement;
    
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'checkout_form',
      field_name: '_form_submit',
      interaction_type: 'submit',
    }));
  });

  it('only tracks first focus per field per page', () => {
    document.body.innerHTML = `
      <form id="contact-form">
        <input type="text" name="name" />
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const input = document.querySelector('input[name="name"]') as HTMLInputElement;
    
    // First focus
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    
    const callCount = mockCapture.mock.calls.filter(
      (call) => call[0] === 'form_interaction' && call[1].interaction_type === 'focus'
    ).length;
    
    // Second focus on same field
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    
    const newCallCount = mockCapture.mock.calls.filter(
      (call) => call[0] === 'form_interaction' && call[1].interaction_type === 'focus'
    ).length;
    
    // Should not have tracked second focus
    expect(newCallCount).toBe(callCount);
  });

  it('tracks validation errors on blur', () => {
    document.body.innerHTML = `
      <form id="checkout-form">
        <input type="email" name="email" required />
      </form>
    `;
    
    renderHook(() => useFormTracking());
    
    const input = document.querySelector('input[name="email"]') as HTMLInputElement;
    
    // Mock invalid validity
    Object.defineProperty(input, 'validity', {
      value: { valid: false },
      writable: true,
    });
    Object.defineProperty(input, 'validationMessage', {
      value: 'Please enter a valid email',
      writable: true,
    });
    
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      field_name: 'email',
      interaction_type: 'error',
      error_message: 'Please enter a valid email',
    }));
  });
});
