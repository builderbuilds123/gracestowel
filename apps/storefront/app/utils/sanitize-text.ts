/**
 * Text Sanitization Utilities
 * 
 * Provides defense-in-depth sanitization for user-provided text
 * that will be rendered in the UI. While React escapes text by default,
 * this provides an additional layer of protection.
 */

/**
 * Sanitize text for safe display in React components
 * Removes potential XSS vectors while preserving normal text
 * 
 * @param text - User-provided text to sanitize
 * @param maxLength - Optional max length (default: 500)
 * @returns Sanitized text safe for display
 */
export function sanitizeDisplayText(text: string | undefined | null, maxLength = 500): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let result = text;

  // Truncate to max length to prevent DoS via large inputs
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  // Remove null bytes and other control characters (except newlines/tabs)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip HTML tags (defense in depth, React escapes anyway)
  result = result.replace(/<[^>]*>/g, '');

  // Remove javascript: and data: protocols
  result = result.replace(/javascript\s*:/gi, '');
  result = result.replace(/data\s*:/gi, '');

  // Normalize whitespace (no excessive spaces)
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Check if a string is a valid base64 data URL for images only
 * More strict than URL prefix checking
 * 
 * @param dataUrl - The data URL to validate
 * @returns true if it's a valid base64 image data URL
 */
export function isValidBase64ImageUrl(dataUrl: string | undefined | null): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return false;
  }

  // Must match: data:image/<type>;base64,<valid-base64-chars>
  const base64ImagePattern = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
  return base64ImagePattern.test(dataUrl);
}
