import React from 'react';

interface PriceDisplayProps {
  /** The price value to display */
  value: number;
  /** Whether the price is currently being recalculated */
  isLoading?: boolean;
  /** Optional prefix like "-" for discounts */
  prefix?: string;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * PriceDisplay Component
 *
 * Industry best practice for displaying prices during cart updates:
 * - Shows a shimmer/skeleton animation when loading
 * - Maintains consistent layout to prevent shifts
 * - Provides immediate visual feedback during backend sync
 *
 * @see https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
 */
export function PriceDisplay({
  value,
  isLoading = false,
  prefix = '$',
  className = '',
  size = 'md',
}: PriceDisplayProps) {
  const sizeClasses = {
    sm: 'text-sm min-w-[60px]',
    md: 'text-base min-w-[70px]',
    lg: 'text-lg min-w-[80px]',
  };

  const formattedPrice = `${prefix}${value.toFixed(2)}`;

  if (isLoading) {
    return (
      <span
        className={`inline-block ${sizeClasses[size]} ${className}`}
        aria-label="Price is being recalculated"
        role="status"
      >
        <span className="inline-block w-full h-5 bg-gray-200 rounded animate-pulse" />
      </span>
    );
  }

  return (
    <span className={`${sizeClasses[size]} ${className}`}>
      {formattedPrice}
    </span>
  );
}

interface PriceRowProps {
  /** Label for the price row */
  label: string;
  /** The price value */
  value: number;
  /** Whether this row is loading */
  isLoading?: boolean;
  /** Optional prefix like "-" for discounts */
  prefix?: string;
  /** Color variant for the price */
  variant?: 'default' | 'discount' | 'total' | 'strikethrough';
  /** Whether to show this row at all */
  show?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * PriceRow Component
 *
 * A complete row for displaying a labeled price in order summaries.
 * Handles loading states with skeleton animation while maintaining layout.
 */
export function PriceRow({
  label,
  value,
  isLoading = false,
  prefix = '$',
  variant = 'default',
  show = true,
  size = 'sm',
}: PriceRowProps) {
  if (!show) return null;

  const variantClasses = {
    default: 'text-text-earthy',
    discount: 'text-green-600',
    total: 'text-accent-earthy',
    strikethrough: 'text-text-earthy/40 line-through',
  };

  const labelClasses = variant === 'total'
    ? 'text-text-earthy font-semibold'
    : 'text-gray-600';

  const priceClasses = variant === 'strikethrough'
    ? 'text-text-earthy/40 line-through font-normal'
    : `font-medium ${variantClasses[variant]}`;

  return (
    <div className="flex justify-between text-sm">
      <span className={labelClasses}>{label}</span>
      {isLoading ? (
        <span className="inline-block w-16 h-5 bg-gray-200 rounded animate-pulse" />
      ) : (
        <span className={priceClasses}>
          {prefix}{value.toFixed(2)}
        </span>
      )}
    </div>
  );
}

/**
 * TotalRow Component
 *
 * Special styled row for the final total with optional strikethrough original price.
 */
interface TotalRowProps {
  /** The final total value */
  value: number;
  /** Original total before discount (shown with strikethrough) */
  originalValue?: number;
  /** Whether this row is loading */
  isLoading?: boolean;
  /** Whether there's a discount applied */
  hasDiscount?: boolean;
}

export function TotalRow({
  value,
  originalValue,
  isLoading = false,
  hasDiscount = false,
}: TotalRowProps) {
  return (
    <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-2">
      <span className="text-text-earthy">Total</span>
      <div className="flex items-center gap-2">
        {hasDiscount && originalValue !== undefined && !isLoading && (
          <span className="text-text-earthy/40 line-through text-sm font-normal">
            ${originalValue.toFixed(2)}
          </span>
        )}
        {isLoading ? (
          <span className="inline-block w-20 h-6 bg-gray-200 rounded animate-pulse" />
        ) : (
          <span className={hasDiscount ? 'text-green-600' : 'text-accent-earthy'}>
            ${value.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

export default PriceDisplay;
