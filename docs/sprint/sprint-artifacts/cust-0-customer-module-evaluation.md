# Evaluation: Customers Module vs Medusa v2 Documentation

**Epic**: Customer Experience
**Story ID**: CUST-0-EVAL
**Status**: Done
**Priority**: High
**Created**: 2026-01-19
**Reference**: [Medusa v2 Storefront Customers Guide](https://docs.medusajs.com/resources/storefront-development/customers/)

---

## Overview

Comprehensive evaluation of the Grace's Towel customers module implementation against the official Medusa v2 storefront development guide. The codebase implements core customer authentication but is missing several key features.

**Overall Score: 5.5/10**

---

## Evaluation Summary

| Feature | Docs Reference | Status | Score |
|---------|---------------|--------|-------|
| **Registration** | `/customers/register` | ✅ Implemented | 9/10 |
| **Login** | `/customers/login` | ✅ Implemented | 9/10 |
| **Third-Party Login** | `/customers/third-party-login` | ❌ Not Implemented | 0/10 |
| **Password Reset** | `/customers/reset-password` | ❌ Not Implemented | 0/10 |
| **Retrieve Customer** | `/customers/retrieve` | ✅ Implemented | 10/10 |
| **Customer Context** | `/customers/context` | ✅ Implemented | 9/10 |
| **Edit Profile** | `/customers/profile` | ❌ Not Implemented | 0/10 |
| **Manage Addresses** | `/customers/addresses` | ⚠️ Partial (Read Only) | 3/10 |
| **Logout** | `/customers/log-out` | ✅ Implemented | 10/10 |

---

## Detailed Analysis

### 1. Registration ✅ (9/10)

**Documentation Requirements:**
- Two-step flow: Auth registration → Profile creation
- Handle existing email gracefully
- Use JWT token for profile creation

**Current Implementation:**
- ✅ Two-step registration flow in `CustomerContext.register()`
- ✅ Auth: `POST /auth/customer/emailpass/register`
- ✅ Profile: `POST /store/customers` with bearer token
- ✅ Token storage in localStorage
- ⚠️ Missing: Graceful handling when email exists with different identity

**File:** `apps/storefront/app/context/CustomerContext.tsx:139-190`

---

### 2. Login ✅ (9/10)

**Documentation Requirements:**
- JWT or Cookie session authentication
- Token exchange for session (optional)
- Auto-fetch customer profile after login

**Current Implementation:**
- ✅ JWT token authentication via `POST /auth/customer/emailpass`
- ✅ Token stored in localStorage
- ✅ Automatic profile fetch after login
- ✅ Bearer token header for authenticated requests
- ⚠️ Not using cookie sessions (but docs say JWT is valid)

**File:** `apps/storefront/app/context/CustomerContext.tsx:111-137`

---

### 3. Third-Party (Social) Login ❌ (0/10)

**Documentation Requirements:**
- Login initiation page with OAuth button
- Callback handler page for token exchange
- Support for Google, GitHub, etc.
- Handle new vs returning customers

**Current Implementation:**
- ❌ No OAuth providers configured
- ❌ No callback route (`/account/callback`)
- ❌ No social login buttons
- ❌ Only `@medusajs/auth-emailpass` installed

**Missing Files:**
- `apps/storefront/app/routes/account.callback.tsx`
- OAuth provider configuration in backend

---

### 4. Password Reset ❌ (0/10)

**Documentation Requirements:**
- Request reset page (email input)
- Reset password page (new password input)
- Token passed via Authorization header (v2.6+)
- Email notification subscriber

**Current Implementation:**
- ❌ No forgot password page
- ❌ No reset password page
- ❌ No email subscriber for reset tokens
- ⚠️ "Forgot Password" link exists in login UI but goes nowhere

**Missing Files:**
- `apps/storefront/app/routes/account.forgot-password.tsx`
- `apps/storefront/app/routes/account.reset-password.tsx`
- `apps/backend/src/subscribers/customer-password-reset.ts`

---

### 5. Retrieve Customer ✅ (10/10)

**Documentation Requirements:**
- Fetch via `GET /store/customers/me`
- Include bearer token in header
- Handle unauthenticated state

**Current Implementation:**
- ✅ Fetches via `medusaFetch('/store/customers/me')`
- ✅ Includes bearer token in Authorization header
- ✅ Handles invalid token by clearing state
- ✅ Auto-redirect to login when unauthenticated

**File:** `apps/storefront/app/context/CustomerContext.tsx:67-109`

---

### 6. Customer React Context ✅ (9/10)

**Documentation Requirements:**
- CustomerProvider wrapping app
- useCustomer hook for child components
- State: customer data + setCustomer

**Current Implementation:**
- ✅ `CustomerProvider` component
- ✅ `useCustomer()` hook
- ✅ State includes: customer, isAuthenticated, isLoading
- ✅ Methods: login, register, logout, refreshCustomer
- ⚠️ Missing: `setCustomer` direct access (by design for encapsulation)
- ✅ PostHog integration for analytics

**Interface:**
```typescript
interface CustomerContextType {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email, password) => Promise<Result>;
  register: (email, password, firstName?, lastName?) => Promise<Result>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}
```

**File:** `apps/storefront/app/context/CustomerContext.tsx`

---

### 7. Edit Customer Profile ❌ (0/10)

**Documentation Requirements:**
- Update form for first_name, last_name, phone, company_name
- Call `POST /store/customers/me` with updated data
- Update context state with response

**Current Implementation:**
- ❌ Profile tab is READ-ONLY
- ❌ No edit button or form
- ❌ No `updateProfile` method in CustomerContext
- ❌ No API call to update customer

**File:** `apps/storefront/app/routes/account.tsx:243-270` (display only)

---

### 8. Manage Customer Addresses ⚠️ (3/10)

**Documentation Requirements:**
- **List:** `GET /store/customers/me/addresses` with pagination
- **Create:** `POST /store/customers/me/addresses`
- **Update:** `POST /store/customers/me/addresses/{id}`
- **Delete:** `DELETE /store/customers/me/addresses/{id}`

**Current Implementation:**
- ✅ **List:** Addresses displayed in account page
- ❌ **Create:** No "Add Address" button in account
- ❌ **Update:** No edit functionality in account
- ❌ **Delete:** No delete functionality
- ⚠️ `EditAddressDialog.tsx` exists but only used for ORDER modification, not account

**Existing Component (Unused for Account):**
- `apps/storefront/app/components/EditAddressDialog.tsx` - designed for order modification window

**File:** `apps/storefront/app/routes/account.tsx` (Addresses tab)

---

### 9. Logout ✅ (10/10)

**Documentation Requirements:**
- Remove JWT token from storage (for JWT auth)
- Redirect to login page

**Current Implementation:**
- ✅ Removes token from localStorage
- ✅ Clears customer state
- ✅ Resets PostHog identification
- ✅ Redirects to home page

**File:** `apps/storefront/app/context/CustomerContext.tsx:192-204`

---

## Critical Gaps

### High Priority (Business Impact)

1. **Password Reset** - Customers cannot recover accounts
   - Requires: 2 pages + 1 subscriber + email template
   - Est. effort: 3-5 points
   - **Story:** [CUST-1-PASSWORD-RESET](cust-1-password-reset.md)

2. **Edit Profile** - Customers cannot update their info
   - Requires: Edit form in account page + context method
   - Est. effort: 2-3 points
   - **Story:** [CUST-2-EDIT-PROFILE](cust-2-edit-profile.md)

3. **Address CRUD** - Customers cannot manage addresses
   - Requires: Add/Edit/Delete UI + API integration
   - Est. effort: 3-5 points
   - **Story:** [CUST-3-ADDRESS-MANAGEMENT](cust-3-address-management.md)

### Medium Priority (User Experience)

4. **Social Login** - Modern auth expectation
   - Requires: OAuth module + callback route + UI buttons
   - Est. effort: 5-8 points
   - **Story:** Backlog

### Low Priority (Enhancement)

5. **Cookie Sessions** - More secure than localStorage
   - Requires: Session exchange endpoint + credentials:include
   - Est. effort: 2-3 points
   - **Story:** Backlog

---

## Files Summary

### Implemented
| File | Purpose |
|------|---------|
| `apps/storefront/app/context/CustomerContext.tsx` | Auth state management |
| `apps/storefront/app/routes/account.tsx` | Account dashboard |
| `apps/storefront/app/routes/account.login.tsx` | Login page |
| `apps/storefront/app/routes/account.register.tsx` | Registration page |
| `apps/backend/src/subscribers/customer-created.ts` | Welcome email |

### Missing
| File | Purpose |
|------|---------|
| `apps/storefront/app/routes/account.forgot-password.tsx` | Request password reset |
| `apps/storefront/app/routes/account.reset-password.tsx` | Set new password |
| `apps/storefront/app/routes/account.callback.tsx` | OAuth callback handler |
| `apps/backend/src/subscribers/customer-password-reset.ts` | Send reset email |

### Underutilized
| File | Purpose |
|------|---------|
| `apps/storefront/app/components/EditAddressDialog.tsx` | Address form (only for orders) |

---

## API Endpoints Reference

| Operation | Endpoint | Status |
|-----------|----------|--------|
| Register Auth | `POST /auth/customer/emailpass/register` | ✅ Used |
| Login | `POST /auth/customer/emailpass` | ✅ Used |
| Get Customer | `GET /store/customers/me` | ✅ Used |
| Create Customer | `POST /store/customers` | ✅ Used |
| Update Customer | `POST /store/customers/me` | ❌ Not Used |
| List Addresses | `GET /store/customers/me/addresses` | ❌ Not Used |
| Create Address | `POST /store/customers/me/addresses` | ❌ Not Used |
| Update Address | `POST /store/customers/me/addresses/{id}` | ❌ Not Used |
| Delete Address | `DELETE /store/customers/me/addresses/{id}` | ❌ Not Used |
| Reset Password Request | `POST /auth/customer/emailpass/reset-password` | ❌ Not Used |
| Reset Password | `POST /auth/customer/emailpass/update-provider` | ❌ Not Used |
| Cookie Session | `POST /auth/session` | ❌ Not Used |
| Logout Session | `DELETE /auth/session` | ❌ Not Used |

---

## Recommendations

### Immediate Actions (Sprint Candidates)

1. **CUST-1: Password Reset Flow** - High business impact
2. **CUST-2: Edit Profile** - Quick win, low effort
3. **CUST-3: Address Management** - Reuse existing dialog component

### Future Enhancements (Backlog)

4. **Google OAuth** - Install `@medusajs/auth-google`, add callback route
5. **Cookie Sessions** - More secure, requires `credentials: include`

---

*Evaluation Date: 2026-01-19*
