import { useState, useCallback, useMemo, useReducer } from "react";
import DOMPurify from "dompurify";

/**
 * Error types for checkout flow.
 * Each type represents a distinct failure point in the checkout process.
 */
export type CheckoutErrorType =
  | 'CART_SYNC'           // Cart sync with Medusa failed
  | 'SHIPPING'            // Shipping options fetch/selection failed
  | 'SHIPPING_PERSIST'    // Shipping persistence to Medusa failed
  | 'PAYMENT_COLLECTION'  // Payment collection creation failed
  | 'PAYMENT_SESSION'     // Payment session creation/refresh failed
  | 'PAYMENT_SUBMIT'      // Payment submission failed
  | 'ADDRESS'             // Address validation failed
  | 'PROMO_CODE';         // Promo code application failed

/**
 * Error severity levels.
 * Determines how the error is displayed and whether it blocks checkout.
 */
export type ErrorSeverity = 'error' | 'warning' | 'info';

/**
 * Structured checkout error with metadata.
 */
export interface CheckoutError {
  /** Error type for categorization */
  type: CheckoutErrorType;
  /** User-friendly error message */
  message: string;
  /** Technical details for debugging (not shown to user) */
  details?: string;
  /** Whether the error is recoverable (user can retry) */
  recoverable: boolean;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Optional action to recover from error */
  action?: {
    label: string;
    handler: () => void;
  };
  /** Timestamp when error occurred */
  timestamp: number;
}

/**
 * Error configuration for pre-defined error messages.
 */
const ERROR_MESSAGES: Record<CheckoutErrorType, { 
  defaultMessage: string; 
  severity: ErrorSeverity;
  recoverable: boolean;
}> = {
  CART_SYNC: {
    defaultMessage: 'Unable to sync cart with server. Please try again.',
    severity: 'error',
    recoverable: true,
  },
  SHIPPING: {
    defaultMessage: 'Unable to fetch shipping options. Please try again.',
    severity: 'error',
    recoverable: true,
  },
  SHIPPING_PERSIST: {
    defaultMessage: 'Shipping selection could not be saved. Your payment may still proceed.',
    severity: 'warning',
    recoverable: true,
  },
  PAYMENT_COLLECTION: {
    defaultMessage: 'Unable to initialize payment. Please refresh the page.',
    severity: 'error',
    recoverable: false,
  },
  PAYMENT_SESSION: {
    defaultMessage: 'Payment session expired. Please refresh the page.',
    severity: 'error',
    recoverable: false,
  },
  PAYMENT_SUBMIT: {
    defaultMessage: 'Payment failed. Please check your card details and try again.',
    severity: 'error',
    recoverable: true,
  },
  ADDRESS: {
    defaultMessage: 'Please provide a valid shipping address.',
    severity: 'warning',
    recoverable: true,
  },
  PROMO_CODE: {
    defaultMessage: 'Unable to apply promo code. Please check the code and try again.',
    severity: 'warning',
    recoverable: true,
  },
};

/**
 * Result from useCheckoutError hook.
 */
interface UseCheckoutErrorResult {
  /** Map of current errors by type */
  errors: Map<CheckoutErrorType, CheckoutError>;
  /** Set an error for a specific type */
  setError: (type: CheckoutErrorType, options?: Partial<Omit<CheckoutError, 'type' | 'timestamp'>>) => void;
  /** Clear a specific error type */
  clearError: (type: CheckoutErrorType) => void;
  /** Clear all errors */
  clearAllErrors: () => void;
  /** Check if any blocking (non-recoverable) errors exist */
  hasBlockingError: boolean;
  /** Check if any errors exist */
  hasAnyError: boolean;
  /** Get errors as array for rendering */
  errorList: CheckoutError[];
  /** Get the most recent error */
  latestError: CheckoutError | null;
  /** Get error by type */
  getError: (type: CheckoutErrorType) => CheckoutError | undefined;
}

/**
 * Hook to manage checkout errors in a unified way.
 * 
 * Provides:
 * - Type-safe error handling
 * - Pre-configured error messages and severity
 * - Blocking vs recoverable error distinction
 * - Recovery actions
 * - Error history for debugging
 * 
 * @example
 * ```tsx
 * const { setError, clearError, hasBlockingError, errorList } = useCheckoutError();
 * 
 * // Set an error
 * setError('CART_SYNC', { message: 'Custom message' });
 * 
 * // Clear specific error
 * clearError('CART_SYNC');
 * 
 * // Render errors
 * {errorList.map(error => (
 *   <ErrorBanner key={error.type} error={error} />
 * ))}
 * ```
 */
type CheckoutErrorState = Map<CheckoutErrorType, CheckoutError>;

type CheckoutErrorAction =
  | { type: 'SET_ERROR'; payload: CheckoutError }
  | { type: 'CLEAR_ERROR'; payload: CheckoutErrorType }
  | { type: 'CLEAR_ALL_ERRORS' };

function checkoutErrorReducer(state: CheckoutErrorState, action: CheckoutErrorAction): CheckoutErrorState {
  const next = new Map(state);
  switch (action.type) {
    case 'SET_ERROR':
      next.set(action.payload.type, action.payload);
      return next;
    case 'CLEAR_ERROR':
      next.delete(action.payload);
      return next;
    case 'CLEAR_ALL_ERRORS':
      return new Map();
    default:
      return state;
  }
}

/**
 * Hook to manage checkout errors in a unified way.
 */
export function useCheckoutError(): UseCheckoutErrorResult {
  const [errors, dispatch] = useReducer(checkoutErrorReducer, new Map());

  /**
   * Set an error for a specific type.
   */
  const setError = useCallback((
    type: CheckoutErrorType, 
    options?: Partial<Omit<CheckoutError, 'type' | 'timestamp'>>
  ) => {
    const defaults = ERROR_MESSAGES[type];
    const error: CheckoutError = {
      type,
      message: options?.message ?? defaults.defaultMessage,
      details: options?.details,
      recoverable: options?.recoverable ?? defaults.recoverable,
      severity: options?.severity ?? defaults.severity,
      action: options?.action,
      timestamp: Date.now(),
    };

    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  /**
   * Clear a specific error type.
   */
  const clearError = useCallback((type: CheckoutErrorType) => {
    dispatch({ type: 'CLEAR_ERROR', payload: type });
  }, []);

  /**
   * Clear all errors.
   */
  const clearAllErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_ERRORS' });
  }, []);

  /**
   * Check if any blocking (non-recoverable) errors exist.
   */
  const hasBlockingError = useMemo(() => 
    (Array.from(errors.values()) as CheckoutError[]).some(e => !e.recoverable && e.severity === 'error'),
    [errors]
  );

  /**
   * Check if any errors exist.
   */
  const hasAnyError = useMemo(() => errors.size > 0, [errors]);

  /**
   * Get errors as sorted array (most recent first).
   */
  const errorList = useMemo(() => 
    (Array.from(errors.values()) as CheckoutError[]).sort((a, b) => b.timestamp - a.timestamp),
    [errors]
  );

  /**
   * Get the most recent error.
   */
  const latestError = useMemo(() => 
    errorList.length > 0 ? (errorList[0] as CheckoutError) : null,
    [errorList]
  );

  /**
   * Get error by type.
   */
  const getError = useCallback((type: CheckoutErrorType) => 
    errors.get(type),
    [errors]
  );

  return {
    errors,
    setError,
    clearError,
    clearAllErrors,
    hasBlockingError,
    hasAnyError,
    errorList,
    latestError,
    getError,
  };
}

/**
 * Helper component for rendering checkout errors.
 * Can be used directly or as reference for custom implementations.
 */
export function CheckoutErrorBanner({ error }: { error: CheckoutError }) {
  const bgColor = {
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  }[error.severity];

  const icon = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }[error.severity];

  return (
    <div className={`${bgColor} border px-4 py-3 rounded mb-4`}>
      <div className="flex items-start gap-2">
        <span>{icon}</span>
        <div className="flex-1">
          <p className="font-medium" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(error.message) }} />
          {error.action && (
            <button
              onClick={error.action.handler}
              className="text-sm underline mt-1 hover:no-underline"
            >
              {error.action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
