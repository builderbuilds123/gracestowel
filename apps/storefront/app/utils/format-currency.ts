/**
 * Shared currency formatting utilities
 * Ensures consistent currency display across the application
 */

export interface FormatCurrencyOptions {
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
}

/**
 * Format a number as currency
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "$75.00")
 */
export function formatCurrency(
  amount: number,
  options: FormatCurrencyOptions = {}
): string {
  const {
    currency = "USD",
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    locale = "en-US",
  } = options;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

/**
 * Format currency with always 2 decimal places
 * @param amount - The amount to format
 * @param currency - Currency code (default: USD)
 */
export function formatCurrencyFixed(
  amount: number,
  currency = "USD"
): string {
  return formatCurrency(amount, {
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
