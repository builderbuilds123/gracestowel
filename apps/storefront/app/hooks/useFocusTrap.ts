import { useEffect, useRef } from 'react';

/**
 * Hook to trap focus within a specific element.
 * Useful for modals, drawers, and menus.
 *
 * @param isOpen - Whether the focus trap should be active
 * @param onClose - Callback to close the trap (e.g. on Escape)
 * @returns A ref to attach to the container element
 */
export function useFocusTrap<T extends HTMLElement>(isOpen: boolean, onClose?: () => void) {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save currently focused element
    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const container = containerRef.current;
    if (!container) return;

    // Focusable elements selector
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }

      // Handle Tab
      if (e.key === 'Tab') {
        const focusableElements = container.querySelectorAll(focusableSelector);
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (!firstElement || !lastElement) return;

        if (e.shiftKey) {
          // Shift + Tab: If on first element, move to last
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          // Tab: If on last element, move to first
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    // Initial focus (move to first focusable element or container)
    const focusableElements = container.querySelectorAll(focusableSelector);
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    } else {
      container.focus();
    }

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Restore focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
}
