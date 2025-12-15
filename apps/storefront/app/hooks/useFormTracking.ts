/**
 * Form Interaction Tracking Hook (Story 5.2.5)
 * Tracks form interactions without capturing values
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';
import posthog from 'posthog-js';

interface FormInteractionEvent {
  form_name: string;
  field_name: string;
  interaction_type: 'focus' | 'blur' | 'submit' | 'error';
  error_message?: string;
}

// Fields that should never be tracked based on name heuristics
const SENSITIVE_FIELDS = ['password', 'secret', 'token', 'key', 'auth', 'credit', 'card', 'cvv', 'cc', 'ssn', 'social', 'security'];

/**
 * Hook to track form interactions
 * 
 * Captures:
 * - Focus/Blur on input fields
 * - Form submissions
 * - Validation errors (if detectable via invalid events)
 * 
 * Safety:
 * - NEVER captures field values
 * - Ignores password fields by default for extra safety
 */
export function useFormTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocus = (e: Event) => {
      trackInteraction(e, 'focus');
    };

    const handleBlur = (e: Event) => {
      trackInteraction(e, 'blur');
    };

    const handleSubmit = (e: Event) => {
      const target = e.target as HTMLFormElement;
      if (!target || target.tagName !== 'FORM') return;

      const formName = target.getAttribute('name') || target.id || 'unknown_form';

      posthog.capture('form_interaction', {
        form_name: formName,
        field_name: 'form',
        interaction_type: 'submit',
      } as FormInteractionEvent);
    };

    const handleInvalid = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const form = target.form;
      const formName = form?.getAttribute('name') || form?.id || 'unknown_form';
      const fieldName = target.name || target.id || 'unknown_field';

      // Check heuristics for sensitive field names
      if (SENSITIVE_FIELDS.some(term => fieldName.toLowerCase().includes(term))) return;

      posthog.capture('form_interaction', {
        form_name: formName,
        field_name: fieldName,
        interaction_type: 'error',
        error_message: target.validationMessage,
      } as FormInteractionEvent);
    };

    const trackInteraction = (e: Event, type: 'focus' | 'blur') => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      // Only track interesting inputs
      if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      // Ignore sensitive fields explicitly
      if (target.type === 'password' || target.type === 'hidden') return;
      if (target.getAttribute('data-sensitive') === 'true') return;

      // Get form name
      const form = target.form;
      const formName = form?.getAttribute('name') || form?.id || 'unknown_form';
      const fieldName = target.name || target.id || 'unknown_field';

      // Check heuristics for sensitive field names
      if (SENSITIVE_FIELDS.some(term => fieldName.toLowerCase().includes(term))) return;

      const eventData: FormInteractionEvent = {
        form_name: formName,
        field_name: fieldName,
        interaction_type: type,
      };

      posthog.capture('form_interaction', eventData);
    };

    // Use capture phase to catch focus/blur events which don't bubble
    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('blur', handleBlur, true);
    window.addEventListener('submit', handleSubmit, true);
    window.addEventListener('invalid', handleInvalid, true);

    return () => {
      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('submit', handleSubmit, true);
      window.removeEventListener('invalid', handleInvalid, true);
    };
  }, [location.pathname]);
}

export default useFormTracking;
