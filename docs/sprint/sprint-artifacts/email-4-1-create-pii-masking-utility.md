# Story 4.1: Create PII Masking Utility

Status: Done

## Story

As a **developer**,
I want **a utility to mask email addresses in logs**,
So that **PII is not exposed in production logs**.

## Acceptance Criteria

### AC1: Standard Email Masking

**Given** an email address `john.doe@example.com`
**When** the masking utility is called
**Then** it returns `j*******@example.com` (first char + asterisks + @ + domain)

### AC2: Short Email Handling

**Given** an email address `a@b.co`
**When** the masking utility is called
**Then** it returns `a@b.co` (short emails kept as-is, domain visible)

### AC3: Invalid Input Handling

**Given** an invalid email or null/undefined
**When** the masking utility is called
**Then** it returns `[invalid-email]` (safe fallback)

### AC4: Domain Preservation

**Given** any valid email address
**When** the masking utility is called
**Then** the domain is preserved for debugging (know which email provider)

## Technical Requirements

### File to Create

`apps/backend/src/utils/email-masking.ts`

### Implementation

```typescript
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
  if (atIndex === -1 || atIndex === 0) {
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
```

## Tasks / Subtasks

- [x] Create `apps/backend/src/utils/email-masking.ts`
- [x] Implement `maskEmail()` function
- [x] Handle null/undefined inputs
- [x] Handle invalid email formats
- [x] Preserve domain for debugging
- [x] Mask local part (first char + asterisks)
- [x] Handle short emails gracefully
- [x] Add JSDoc documentation
- [x] Optionally implement `maskEmailsInText()` helper

## Testing Requirements

### Unit Tests

Create `apps/backend/integration-tests/unit/email-masking.unit.spec.ts`:

```typescript
import { maskEmail, maskEmailsInText } from "../../src/utils/email-masking"

describe("maskEmail", () => {
  it("masks standard email addresses", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j*******@example.com")
    expect(maskEmail("alice@gmail.com")).toBe("a****@gmail.com")
    expect(maskEmail("bob.smith@company.co.uk")).toBe("b*******@company.co.uk")
  })

  it("preserves domain", () => {
    const result = maskEmail("test@specific-domain.com")
    expect(result).toContain("@specific-domain.com")
  })

  it("handles short local parts", () => {
    expect(maskEmail("a@b.co")).toBe("a@b.co")
    expect(maskEmail("ab@test.com")).toBe("ab@test.com")
  })

  it("handles null and undefined", () => {
    expect(maskEmail(null)).toBe("[invalid-email]")
    expect(maskEmail(undefined)).toBe("[invalid-email]")
  })

  it("handles invalid emails", () => {
    expect(maskEmail("not-an-email")).toBe("[invalid-email]")
    expect(maskEmail("@nodomain.com")).toBe("[invalid-email]")
    expect(maskEmail("noat")).toBe("[invalid-email]")
    expect(maskEmail("")).toBe("[invalid-email]")
  })

  it("handles emails with special characters", () => {
    expect(maskEmail("user+tag@example.com")).toBe("u*******@example.com")
    expect(maskEmail("first.last@example.com")).toBe("f*******@example.com")
  })

  it("caps asterisks at 7", () => {
    const result = maskEmail("verylonglocalpart@example.com")
    expect(result).toBe("v*******@example.com")
  })
})

describe("maskEmailsInText", () => {
  it("masks emails in text", () => {
    const text = "Contact john@example.com or jane@test.org for help"
    const result = maskEmailsInText(text)
    expect(result).toBe("Contact j***@example.com or j***@test.org for help")
  })

  it("handles text without emails", () => {
    const text = "No emails here"
    expect(maskEmailsInText(text)).toBe("No emails here")
  })
})
```

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/email-masking.unit.spec.ts
```

## Definition of Done

- [x] File `apps/backend/src/utils/email-masking.ts` exists
- [x] `maskEmail()` masks local part, preserves domain
- [x] Short emails (1-2 char local) handled gracefully
- [x] Invalid/null inputs return `[invalid-email]`
- [x] Asterisks capped at 7 for readability
- [x] Unit tests cover: normal email, short email, invalid email, null
- [x] JSDoc documentation added
- [x] No TypeScript errors

## Dev Notes

### Why Preserve Domain?

The domain helps with debugging:

- Know if it's a Gmail, corporate, or disposable email
- Identify patterns in failures (e.g., all @hotmail.com failing)
- Still protects the user's identity

### Asterisk Cap

Capping at 7 asterisks keeps logs readable:

- `j*******@example.com` (7 asterisks)
- Not `j*******************@example.com` (too long)

### Usage in Other Stories

This utility is used by:

- Story 1.2: Email Worker (logging)
- Story 2.2: DLQ (storing masked recipient)
- Story 4.2: Structured Logging

Import as:

```typescript
import { maskEmail } from "../utils/email-masking"
```

### Edge Cases

Consider these edge cases:

- Unicode in email local part
- Very long domains
- Multiple @ symbols (invalid)
- Whitespace around email

## References

- [Email Worker (Story 1.2)](docs/sprint/sprint-artifacts/email-1-2-create-email-worker.md)
- [DLQ (Story 2.2)](docs/sprint/sprint-artifacts/email-2-2-implement-dead-letter-queue.md)
- [Architecture Doc - PII](docs/product/architecture/transactional-email-architecture.md)
- [PRD - NFR6](docs/product/prds/transactional-email-prd.md)

## Dev Agent Record

### Agent Model Used

BMad Code Reviewer (Gemini 2.5 Pro)

### Completion Notes

Implementation was already complete. Code review discovered both source and tests exist:
- `email-masking.ts`: 67 lines, implements `maskEmail()` and `maskEmailsInText()`
- `email-masking.unit.spec.ts`: 9 tests covering all 4 ACs
- Utility is actively used by `email-queue.ts` and `email-worker.ts`

All tests pass (9/9).

### File List

| File | Change |
|------|--------|
| `apps/backend/src/utils/email-masking.ts` | Existing - verified |
| `apps/backend/integration-tests/unit/email-masking.unit.spec.ts` | Existing - verified |

### Change Log

- [2025-12-16] Code Review: Verified existing implementation covers all ACs
- [2025-12-16] Updated story status from Ready-for-Dev to Done
- [2025-12-16] Marked all tasks and DoD items as complete
