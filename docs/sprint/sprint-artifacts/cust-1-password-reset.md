# Story: Password Reset Flow

**Epic**: Customer Experience
**Story ID**: CUST-1-PASSWORD-RESET
**Status**: Backlog
**Priority**: High
**Estimated Effort**: 3-5 story points
**Created**: 2026-01-19
**Parent**: [CUST-0: Customer Module Evaluation](cust-0-customer-module-evaluation.md)

---

## Overview

Implement password reset flow for customers following Medusa v2 documentation. Customers currently cannot recover their accounts if they forget their password.

---

## User Story

**As a** customer who forgot their password,
**I want** to reset my password via email,
**So that** I can regain access to my account.

---

## Current State

| Component | Status |
|-----------|--------|
| **Forgot Password Page** | NOT implemented |
| **Reset Password Page** | NOT implemented |
| **Reset Email Template** | NOT implemented |
| **Password Reset Subscriber** | NOT implemented |
| **"Forgot Password" Link** | Exists in login UI (non-functional) |

---

## Acceptance Criteria

### AC1: Forgot Password Page

**Given** a customer on the login page
**When** they click "Forgot Password"
**Then** they see a form to enter their email address

### AC2: Password Reset Request

**Given** a customer enters their email on the forgot password page
**When** they submit the form
**Then** Medusa sends a reset token to that email
**And** the customer sees a success message

### AC3: Reset Email Sent

**Given** a valid password reset request
**When** the `auth.password_reset` event fires
**Then** an email with reset link is sent via Resend
**And** the link includes the reset token

### AC4: Reset Password Page

**Given** a customer clicks the reset link in their email
**When** the page loads
**Then** they see a form to enter a new password

### AC5: Password Update

**Given** a customer enters a new password on the reset page
**When** they submit the form
**Then** their password is updated in Medusa
**And** they are redirected to login with a success message

### AC6: Invalid/Expired Token

**Given** a customer uses an expired or invalid reset token
**When** they try to reset their password
**Then** they see an error message
**And** are prompted to request a new reset link

---

## Implementation Steps

### Step 1: Create Forgot Password Page

**File:** `apps/storefront/app/routes/account.forgot-password.tsx` (NEW)

```typescript
// Route: /account/forgot-password
// Form with email input
// Calls POST /auth/customer/emailpass/reset-password
// Shows success message on completion
```

**UI Requirements:**
- Email input field with validation
- Submit button with loading state
- Success message: "Check your email for reset instructions"
- Error handling for invalid email

---

### Step 2: Create Reset Password Page

**File:** `apps/storefront/app/routes/account.reset-password.tsx` (NEW)

```typescript
// Route: /account/reset-password?token=xxx
// Extract token from URL query params
// Form with new password + confirm password
// Calls POST /auth/customer/emailpass/update-provider with token in Authorization header
// Redirects to login on success
```

**UI Requirements:**
- Password input with visibility toggle
- Confirm password input
- Password strength indicator (optional)
- Submit button with loading state
- Error handling for mismatched passwords

---

### Step 3: Create Password Reset Email Subscriber

**File:** `apps/backend/src/subscribers/customer-password-reset.ts` (NEW)

```typescript
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"
import { enqueueEmail } from "../lib/email-queue"

interface PasswordResetEventData {
  entity_id: string  // customer_id
  token: string
  actor_type: string
}

export default async function customerPasswordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEventData>) {
  const logger = container.resolve("logger")

  // Get customer email
  const query = container.resolve("query")
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name"],
    filters: { id: data.entity_id },
  })

  if (!customers?.length) {
    logger.error(`[PASSWORD_RESET] Customer not found: ${data.entity_id}`)
    return
  }

  const customer = customers[0]
  const resetUrl = `${process.env.STOREFRONT_URL}/account/reset-password?token=${data.token}`

  await enqueueEmail({
    type: "password-reset",
    to: customer.email,
    subject: "Reset Your Password - Grace's Towel",
    data: {
      first_name: customer.first_name || "Customer",
      reset_url: resetUrl,
      expires_in: "1 hour",
    },
  })

  logger.info(`[PASSWORD_RESET] Reset email queued for ${customer.email}`)
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
```

---

### Step 4: Create Password Reset Email Template

**File:** `apps/backend/src/modules/resend/templates/password-reset.tsx` (NEW)

React Email template with:

- Grace's Towel branding
- Reset button/link
- Expiration warning
- Security notice ("If you didn't request this...")

---

### Step 5: Update Login Page Link

**File:** `apps/storefront/app/routes/account.login.tsx`

Update the existing "Forgot Password" link to point to `/account/forgot-password`.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/storefront/app/routes/account.forgot-password.tsx` | CREATE |
| `apps/storefront/app/routes/account.reset-password.tsx` | CREATE |
| `apps/backend/src/subscribers/customer-password-reset.ts` | CREATE |
| `apps/backend/src/modules/resend/templates/password-reset.tsx` | CREATE |
| `apps/storefront/app/routes/account.login.tsx` | MODIFY (update link) |

---

## API Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Request Reset | `/auth/customer/emailpass/reset-password` | POST |
| Update Password | `/auth/customer/emailpass/update-provider` | POST |

**Request Reset Payload:**
```json
{
  "identifier": "customer@example.com"
}
```

**Update Password Payload:**
```json
{
  "password": "newPassword123"
}
```
Headers: `Authorization: Bearer <reset_token>`

---

## Definition of Done

- [ ] Forgot password page created and functional
- [ ] Reset password page created and functional
- [ ] Password reset subscriber sends email via Resend
- [ ] Email template matches Grace's Towel branding
- [ ] Invalid/expired tokens show appropriate error
- [ ] Login page "Forgot Password" link works
- [ ] `pnpm build` passes in both apps
- [ ] `pnpm typecheck` passes
- [ ] Manual test: Full password reset flow works

---

## Verification

1. **Request reset:** Enter email, verify email received
2. **Reset password:** Click link, enter new password, verify login works
3. **Expired token:** Wait or use invalid token, verify error shown
4. **Build:** `pnpm build` in both apps

---

## References

- [Medusa v2 Reset Password Guide](https://docs.medusajs.com/resources/storefront-development/customers/reset-password)
- Parent: `docs/sprint/sprint-artifacts/cust-0-customer-module-evaluation.md`
- Existing Email Queue: `apps/backend/src/lib/email-queue.ts`

---

#### Created
2026-01-19
