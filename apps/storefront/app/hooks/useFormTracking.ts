/**
 * Form Interaction Tracking Hook (Story 5.1)
 * Tracks user interactions with forms (without capturing sensitive values)
 */

import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface FormInteractionEvent {
  form_name: string;
  field_name: string;
  interaction_type: 'focus' | 'blur' | 'change' | 'submit' | 'error';
  page_path: string;
  field_type?: string;
  error_message?: string;
}

// Fields that should NEVER have values logged
const SENSITIVE_FIELDS = [
  'password',
  'card',
  'cvv',
  'cvc',
  'credit',
  'debit',
  'ssn',
  'social',
  'secret',
  'token',
  'pin',
];

// Known form names by route or id
const FORM_IDENTIFIERS: Record<string, string> = {
  checkout: 'checkout_form',
  login: 'login_form',
  register: 'register_form',
  search: 'search_form',
  contact: 'contact_form',
  newsletter: 'newsletter_form',
  review: 'review_form',
  address: 'address_form',
  account: 'account_form',
};

/**
 * Determine form name from element context
 */
function getFormName(element: HTMLElement): string {
  // Check for explicit data attribute
  const dataFormName = element.closest('[data-form-name]')?.getAttribute('data-form-name');
  if (dataFormName) return dataFormName;
  
  // Check form id or name
  const form = element.closest('form');
  if (form) {
    if (form.id) {
      for (const [key, name] of Object.entries(FORM_IDENTIFIERS)) {
        if (form.id.toLowerCase().includes(key)) return name;
      }
      return form.id;
    }
    if (form.name) return form.name;
  }
  
  // Check current URL path for context
  const path = window.location.pathname.toLowerCase();
  for (const [key, name] of Object.entries(FORM_IDENTIFIERS)) {
    if (path.includes(key)) return name;
  }
  
  return 'unknown_form';
}

/**
 * Get field name safely (sanitized)
 */
function getFieldName(element: HTMLElement): string {
  const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  
  // Prefer explicit data attribute
  const dataFieldName = element.getAttribute('data-field-name');
  if (dataFieldName) return dataFieldName;
  
  // Use name or id first
  if (input.name) return input.name;
  if (input.id) return input.id;
  
  // Check for placeholder (not available on select elements)
  if ('placeholder' in input && input.placeholder) return input.placeholder;
  
  // Fallback to aria-label
  return element.getAttribute('aria-label') || 'unknown_field';
}

/**
 * Check if field is sensitive
 */
function isSensitiveField(fieldName: string, fieldType?: string): boolean {
  const lowerName = fieldName.toLowerCase();
  
  // Check against sensitive field patterns
  if (SENSITIVE_FIELDS.some(sensitive => lowerName.includes(sensitive))) {
    return true;
  }
  
  // Password type inputs are always sensitive
  if (fieldType === 'password') {
    return true;
  }
  
  return false;
}

/**
 * Hook to track form interactions
 * 
 * Tracks:
 * - Field focus/blur
 * - Form submissions
 * - Validation errors
 * 
 * Security:
 * - NEVER captures field values
 * - Identifies sensitive fields by name/type
 * - Only tracks field names and interaction types
 * 
 * @example
 * ```tsx
 * function App() {
 *   useFormTracking();
 *   return <Outlet />;
 * }
 * ```
 */
export function useFormTracking() {
  const location = useLocation();
  const trackedFocusFields = useRef<Set<string>>(new Set());

  const sendFormEvent = useCallback((eventData: FormInteractionEvent) => {
    if (typeof window === 'undefined') return;
    
    // Don't log sensitive field names in detail
    if (isSensitiveField(eventData.field_name, eventData.field_type)) {
      eventData.field_name = '[sensitive]';
    }
    
    posthog.capture('form_interaction', eventData);
    
    if (import.meta.env.MODE === 'development') {
      console.log(`[Form] ${eventData.form_name}.${eventData.field_name} - ${eventData.interaction_type}`);
    }
  }, []);

  // Handle focus events
  const handleFocus = useCallback((event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    
    const formName = getFormName(target);
    const fieldName = getFieldName(target);
    const fieldType = (target as HTMLInputElement).type;
    const fieldKey = `${formName}.${fieldName}`;
    
    // Only track first focus per field per page visit
    if (trackedFocusFields.current.has(fieldKey)) return;
    trackedFocusFields.current.add(fieldKey);
    
    sendFormEvent({
      form_name: formName,
      field_name: fieldName,
      field_type: fieldType,
      interaction_type: 'focus',
      page_path: location.pathname,
    });
  }, [location.pathname, sendFormEvent]);

  // Handle blur events (field left)
  const handleBlur = useCallback((event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    
    const input = target as HTMLInputElement;
    const formName = getFormName(target);
    const fieldName = getFieldName(target);
    const fieldType = input.type;
    
    // Check for validation errors
    const hasError = !input.validity?.valid;
    let errorMessage: string | undefined;
    
    if (hasError) {
      // Get browser validation message (safe to log)
      errorMessage = input.validationMessage || 'Validation error';
    }
    
    sendFormEvent({
      form_name: formName,
      field_name: fieldName,
      field_type: fieldType,
      interaction_type: hasError ? 'error' : 'blur',
      page_path: location.pathname,
      error_message: hasError ? errorMessage : undefined,
    });
  }, [location.pathname, sendFormEvent]);

  // Handle form submissions
  const handleSubmit = useCallback((event: Event) => {
    const form = event.target as HTMLFormElement;
    if (!form || form.tagName !== 'FORM') return;
    
    const formName = getFormName(form);
    
    sendFormEvent({
      form_name: formName,
      field_name: '_form_submit',
      interaction_type: 'submit',
      page_path: location.pathname,
    });
  }, [location.pathname, sendFormEvent]);

  // Reset tracking on route change
  useEffect(() => {
    trackedFocusFields.current = new Set();
  }, [location.pathname]);

  // Set up event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Use capture phase to catch events before they might be stopped
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('focusout', handleBlur, true);
    document.addEventListener('submit', handleSubmit, true);
    
    return () => {
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('focusout', handleBlur, true);
      document.removeEventListener('submit', handleSubmit, true);
    };
  }, [handleFocus, handleBlur, handleSubmit]);
}

export default useFormTracking;
