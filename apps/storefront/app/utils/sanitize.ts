import DOMPurify from 'dompurify';

/**
 * Sanitize user input to prevent XSS attacks.
 * 
 * Uses DOMPurify to strip all HTML tags and attributes,
 * returning only the text content.
 * 
 * @param input - The potentially unsafe input string
 * @returns Sanitized text-only string
 * 
 * @example
 * ```tsx
 * // Safe to render in JSX
 * <p>{sanitize(shippingAddress.name)}</p>
 * ```
 */
export function sanitize(input: string | undefined | null): string {
  if (!input) return '';
  
  // Use DOMPurify with no allowed tags to get text-only output
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Sanitize an address object's fields.
 * 
 * @param address - The address object with potentially unsafe fields
 * @returns New address object with all string fields sanitized
 */
export function sanitizeAddress<T extends Record<string, unknown>>(address: T): T {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(address)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitize(value);
    } else if (value !== null && typeof value === 'object') {
      sanitized[key] = sanitizeAddress(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}
