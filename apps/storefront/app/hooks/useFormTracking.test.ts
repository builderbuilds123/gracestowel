import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormTracking } from './useFormTracking';

// Mock react-router
const mockLocation = { pathname: '/login', search: '' };
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
  });

  it('captures focus on input fields', () => {
    renderHook(() => useFormTracking());
    
    // Create form and input
    const form = document.createElement('form');
    form.id = 'login-form';
    document.body.appendChild(form);
    
    const input = document.createElement('input');
    input.name = 'email';
    input.type = 'email';
    form.appendChild(input);

    // Simulate focus
    input.focus();
    // JSDOM focus doesn't trigger global capture listener automatically?
    // Dispatch event manually
    const event = new Event('focus', { bubbles: false, cancelable: false });
    input.dispatchEvent(event);
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'login-form',
      field_name: 'email',
      interaction_type: 'focus',
    }));

    document.body.removeChild(form);
  });

  it('captures blur on input fields', () => {
    renderHook(() => useFormTracking());
    
    const form = document.createElement('form');
    form.name = 'signup';
    document.body.appendChild(form);
    
    const input = document.createElement('input');
    input.name = 'username';
    form.appendChild(input);
    
    input.dispatchEvent(new Event('blur'));
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'signup',
      field_name: 'username',
      interaction_type: 'blur',
    }));

    document.body.removeChild(form);
  });

  it('captures form submission', () => {
    renderHook(() => useFormTracking());
    
    const form = document.createElement('form');
    form.id = 'checkout';
    document.body.appendChild(form);
    
    form.dispatchEvent(new Event('submit', { bubbles: true }));
    
    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'checkout',
      field_name: 'form',
      interaction_type: 'submit',
    }));

    document.body.removeChild(form);
  });

  it('captures validation errors', () => {
    renderHook(() => useFormTracking());

    const form = document.createElement('form');
    form.id = 'register';
    document.body.appendChild(form);

    const input = document.createElement('input');
    input.name = 'age';
    input.type = 'number';
    input.required = true;
    form.appendChild(input);

    // Set validation message mock (jsdom might not do it automatically)
    Object.defineProperty(input, 'validationMessage', {
      value: 'Please fill out this field.',
      writable: true
    });

    input.dispatchEvent(new Event('invalid', { bubbles: false, cancelable: true }));

    expect(mockCapture).toHaveBeenCalledWith('form_interaction', expect.objectContaining({
      form_name: 'register',
      field_name: 'age',
      interaction_type: 'error',
      error_message: 'Please fill out this field.',
    }));

    document.body.removeChild(form);
  });

  it('ignores password fields', () => {
    renderHook(() => useFormTracking());
    
    const form = document.createElement('form');
    document.body.appendChild(form);
    
    const input = document.createElement('input');
    input.name = 'password';
    input.type = 'password';
    form.appendChild(input);
    
    input.dispatchEvent(new Event('focus'));

    expect(mockCapture).not.toHaveBeenCalled();

    document.body.removeChild(form);
  });

  it('ignores hidden fields', () => {
    renderHook(() => useFormTracking());

    const form = document.createElement('form');
    document.body.appendChild(form);

    const input = document.createElement('input');
    input.name = 'token';
    input.type = 'hidden';
    form.appendChild(input);

    input.dispatchEvent(new Event('focus'));

    expect(mockCapture).not.toHaveBeenCalled();
    
    document.body.removeChild(form);
  });

  it('ignores sensitive fields by name heuristic', () => {
    renderHook(() => useFormTracking());
    
    const form = document.createElement('form');
    document.body.appendChild(form);
    
    const sensitiveNames = ['credit_card', 'user_ssn', 'api_key', 'auth_token'];
    
    sensitiveNames.forEach(name => {
      const input = document.createElement('input');
      input.name = name;
      input.type = 'text'; // Even if type is text
      form.appendChild(input);

      input.dispatchEvent(new Event('focus'));
    });
    
    expect(mockCapture).not.toHaveBeenCalled();

    document.body.removeChild(form);
  });
});
