/**
 * Masks an email address for safe logging.
 * Preserves domain for debugging while hiding the local part.
 *
 * Examples:
 * - "john.doe@example.com" → "j*******@example.com"
 * - "a@b.co" → "a@b.co" (too short to mask)
 * - null → "[invalid-email]"
 *
 * @param email - Email address to mask
 * @returns Masked email string
 */
export function maskEmail(email: string | null | undefined): string {
  // Handle null/undefined
  if (!email) {
    return "[invalid-email]"
  }

  // Handle non-string input
  if (typeof email !== "string") {
    return "[invalid-email]"
  }

  // Trim whitespace
  const trimmed = email.trim()

  // Basic email validation
  const atIndex = trimmed.indexOf("@")
  const lastAtIndex = trimmed.lastIndexOf("@")
  if (atIndex === -1 || atIndex === 0 || atIndex !== lastAtIndex) {
    return "[invalid-email]"
  }

  const localPart = trimmed.substring(0, atIndex)
  const domain = trimmed.substring(atIndex + 1)

  // Validate domain has at least one dot
  if (!domain.includes(".")) {
    return "[invalid-email]"
  }

  // If local part is very short (1-2 chars), don't mask
  if (localPart.length <= 2) {
    return trimmed
  }

  // Mask: keep first char, replace rest with asterisks
  const firstChar = localPart[0]
  const maskedLength = Math.min(localPart.length - 1, 7) // Cap at 7 asterisks
  const masked = firstChar + "*".repeat(maskedLength)

  return `${masked}@${domain}`
}

/**
 * Masks multiple email addresses in a string.
 * Useful for masking emails in error messages or logs.
 *
 * @param text - Text that may contain email addresses
 * @returns Text with emails masked
 */
export function maskEmailsInText(text: string): string {
  // Simple email regex - not perfect but catches most cases
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

  return text.replace(emailRegex, (match) => maskEmail(match))
}
