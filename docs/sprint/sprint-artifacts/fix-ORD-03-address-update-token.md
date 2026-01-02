# IMPL-ORD-03: Address update token transport mismatch

**Status:** ✅ **COMPLETE**

## User Story

**As a** Frontend Developer,
**I want** all modification endpoints to use the standard `x-modification-token` header consistently,
**So that** I don't have to write custom logic for different endpoints.

## Acceptance Criteria

### Scenario 1: Header-Only Authentication ✅ IMPLEMENTED

**Given** a valid modification token
**When** I make a request to any modification endpoint sending the token in the `x-modification-token` header
**Then** the request should be accepted and processed

### Scenario 2: Fail-Loud Pattern ✅ IMPLEMENTED

**Given** a misconfigured client
**When** it sends the token in the request body instead of the header
**Then** the request should be **REJECTED** with a clear 400 error explaining header is required

## Technical Implementation (Revised - Comprehensive Token Standardization)

### Problem

1. **Original Issue:** Storefront sends modification token in `x-modification-token` header, but `/address` endpoint expected it in body
2. **Discovered Issue:** Other endpoints (`/line-items`, `/line-items/update`) had **silent fallback** from header to body, masking client misconfiguration
3. **Security Issue:** Body-based token acceptance violates OWASP REST security guidelines

### Solution Overview

**Comprehensive token standardization** across ALL modification endpoints:
- ✅ Header-only pattern (no body fallback)
- ✅ Fail-loud on misconfiguration
- ✅ Clear, actionable error messages
- ✅ Comprehensive test coverage

### Implementation Steps

#### 1. Backend Routes - All Modified ✅

**Files Updated:**
- ✅ `apps/backend/src/api/store/orders/[id]/line-items/route.ts`
- ✅ `apps/backend/src/api/store/orders/[id]/line-items/update/route.ts`
- ✅ `apps/backend/src/api/store/orders/[id]/address/route.ts`
- ✅ `apps/backend/src/api/store/orders/[id]/cancel/route.ts`

**Changes:**
- ✅ Removed `bodyToken` fallback logic
- ✅ Header-only token extraction: `const token = req.headers["x-modification-token"]`
- ✅ Enhanced error messages: `"x-modification-token header is required. Token must be sent in header, not request body."`
- ✅ Updated JSDoc with comprehensive error code documentation

#### 2. Test Coverage ✅

**New Test File:** `apps/backend/integration-tests/unit/modification-token-auth.unit.spec.ts`

**Coverage:**
- ✅ Header token acceptance (all 4 endpoints)
- ✅ Body token **rejection** with 400 error (fail-loud)
- ✅ Missing token error handling
- ✅ Error message quality verification
- ✅ Cross-endpoint consistency validation

**Test Results:** ✅ **18/18 tests passing**

### Verification

- ✅ **Unit Tests:** All modification endpoints reject body tokens
- ✅ **Error Messages:** Clear, actionable guidance for developers
- ✅ **API Consistency:** All 4 POST endpoints use identical pattern
- ✅ **Security:** OWASP-compliant header-based authentication
- ✅ **Storefront Compatibility:** Frontend already sends headers (no changes needed)

### Dev Agent Record

**Files Modified:**
1. `apps/backend/src/api/store/orders/[id]/line-items/route.ts` - Removed body fallback, updated JSDoc
2. `apps/backend/src/api/store/orders/[id]/line-items/update/route.ts` - Removed body fallback, updated JSDoc
3. `apps/backend/src/api/store/orders/[id]/address/route.ts` - Changed from body-only to header-only
4. `apps/backend/src/api/store/orders/[id]/cancel/route.ts` - Updated JSDoc for consistency
5. `apps/backend/integration-tests/unit/modification-token-auth.unit.spec.ts` - **NEW** comprehensive test suite

**Change Summary:**
- Lines added: ~400 (mostly comprehensive tests)
- Lines removed: ~12 (body fallback logic)
- Net security improvement: **HIGH** (OWASP compliant, fail-loud pattern)

### Dependencies

- None

### Notes

**Design Decision: No Backward Compatibility**

We chose **NOT** to implement backward compatibility (body token fallback) because:
1. **Storefront already sends headers** - No production clients use body tokens
2. **Fail-loud is better** - Silent fallbacks mask bugs and security issues
3. **OWASP compliance** - Header-based auth is the security best practice
4. **Simplified testing** - Clear expectations, easier to validate

This approach ensures client bugs are caught immediately rather than silently accepted.
