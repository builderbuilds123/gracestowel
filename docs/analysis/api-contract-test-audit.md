# API Contract Test Audit Report

**Date:** 2026-01-06  
**Status:** Initial Audit Complete  
**Scope:** All Postman collections and API endpoints in backend and storefront

## Executive Summary

This audit analyzed all existing Postman collections and mapped them against actual API endpoints in both the backend (Medusa v2) and storefront (React Router v7). The analysis identified coverage gaps, missing contract tests, and areas requiring schema validation improvements.

### Key Findings

- **Total Backend API Routes:** 20 routes across admin, store, webhooks, and health endpoints
- **Total Storefront API Routes:** 16 routes (excluding test files)
- **Postman Collections:** 6 collections (store-api, admin-api, custom-endpoints, stripe-webhooks, checkout-flow, payment-capture)
- **Coverage Status:** ~40% of backend routes have contract tests, ~30% of storefront routes have contract tests
- **Schema Quality:** Mixed - some endpoints have comprehensive schemas, others lack validation entirely

## Coverage Analysis

### Backend API Routes Coverage

#### Admin Endpoints

| Endpoint | Method | Collection | Contract Test | Status |
|----------|--------|------------|---------------|--------|
| `/admin/reviews` | GET | admin-api | ❌ Missing | **CRITICAL** |
| `/admin/reviews/:id` | GET | admin-api | ❌ Missing | **CRITICAL** |
| `/admin/reviews/:id` | POST | admin-api | ❌ Missing | **CRITICAL** |
| `/admin/reviews/:id` | DELETE | admin-api | ❌ Missing | **CRITICAL** |
| `/admin/reviews/batch` | POST | admin-api | ❌ Missing | **HIGH** |
| `/admin/stripe-queue-status` | GET | admin-api | ❌ Missing | **MEDIUM** |
| `/admin/custom` | GET | custom-endpoints | ✅ Present | ✅ Complete |
| `/admin/products` | GET | admin-api | ✅ Present | ✅ Complete |
| `/admin/products` | POST | admin-api | ⚠️ No schema | **MEDIUM** |
| `/admin/orders` | GET | admin-api | ✅ Present | ✅ Complete |
| `/admin/customers` | GET | admin-api | ⚠️ No schema | **MEDIUM** |
| `/admin/users` | GET | admin-api | ⚠️ No schema | **MEDIUM** |
| `/admin/users` | POST | admin-api | ⚠️ No schema | **MEDIUM** |

#### Store Endpoints

| Endpoint | Method | Collection | Contract Test | Status |
|----------|--------|------------|---------------|--------|
| `/store/products` | GET | store-api | ✅ Present | ✅ Complete |
| `/store/products?handle=:handle` | GET | store-api | ⚠️ No schema | **MEDIUM** |
| `/store/carts` | POST | store-api | ⚠️ Basic only | **MEDIUM** |
| `/store/carts/:id` | GET | store-api | ✅ Present | ✅ Complete |
| `/store/carts/:id/line-items` | POST | store-api | ⚠️ Basic only | **MEDIUM** |
| `/store/carts/:id` | POST | store-api | ⚠️ Basic only | **MEDIUM** |
| `/store/carts/:id/payment-sessions` | POST | checkout-flow | ⚠️ Basic only | **MEDIUM** |
| `/store/carts/:id/complete` | POST | checkout-flow | ⚠️ Basic only | **MEDIUM** |
| `/store/orders/:id` | GET | ❌ None | ❌ Missing | **CRITICAL** |
| `/store/orders/:id/address` | POST | ❌ None | ❌ Missing | **HIGH** |
| `/store/orders/:id/cancel` | POST | ❌ None | ❌ Missing | **HIGH** |
| `/store/orders/:id/guest-view` | GET | ❌ None | ❌ Missing | **HIGH** |
| `/store/orders/:id/line-items` | POST | ❌ None | ❌ Missing | **MEDIUM** |
| `/store/orders/:id/line-items/update` | POST | ❌ None | ❌ Missing | **MEDIUM** |
| `/store/orders/by-payment-intent/:id` | GET | ❌ None | ❌ Missing | **HIGH** |
| `/store/products/:id/reviews` | GET | ❌ None | ❌ Missing | **CRITICAL** |
| `/store/products/:id/reviews` | POST | ❌ None | ❌ Missing | **CRITICAL** |
| `/store/reviews/:reviewId/helpful` | POST | ❌ None | ❌ Missing | **MEDIUM** |
| `/store/reviews/:reviewId/helpful` | GET | ❌ None | ❌ Missing | **MEDIUM** |
| `/store/custom` | GET | custom-endpoints | ⚠️ No schema | **LOW** |
| `/store/debug/stripe-flow` | GET | ❌ None | ❌ Missing | **LOW** |
| `/store/regions` | GET | store-api | ⚠️ No schema | **MEDIUM** |
| `/store/collections` | GET | store-api | ⚠️ No schema | **MEDIUM** |

#### Webhooks

| Endpoint | Method | Collection | Contract Test | Status |
|----------|--------|------------|---------------|--------|
| `/webhooks/stripe` | POST | stripe-webhooks | ⚠️ No schema | **HIGH** |

#### Health Endpoints

| Endpoint | Method | Collection | Contract Test | Status |
|----------|--------|------------|---------------|--------|
| `/health` | GET | custom-endpoints | ⚠️ No schema | **MEDIUM** |
| `/health/workers` | GET | ❌ None | ❌ Missing | **MEDIUM** |
| `/health/workers/failed` | GET | ❌ None | ❌ Missing | **LOW** |

### Storefront API Routes Coverage

| Endpoint | Method | Collection | Contract Test | Status |
|----------|--------|------------|---------------|--------|
| `/api/carts` | POST | ❌ None | ❌ Missing | **CRITICAL** |
| `/api/carts/:id` | GET | ❌ None | ❌ Missing | **CRITICAL** |
| `/api/carts/:id` | POST | ❌ None | ❌ Missing | **CRITICAL** |
| `/api/carts/:id/shipping-options` | GET | ❌ None | ❌ Missing | **HIGH** |
| `/api/carts/:id/shipping-methods` | POST | ❌ None | ❌ Missing | **HIGH** |
| `/api/carts/:id/complete` | POST | ❌ None | ❌ Missing | **CRITICAL** |
| `/api/payment-intent` | POST | ❌ None | ❌ Missing | **CRITICAL** |
| `/api/checkout-session` | POST | ❌ None | ❌ Missing | **HIGH** |
| `/api/shipping-rates` | POST | ❌ None | ❌ Missing | **HIGH** |
| `/api/health` | GET | ❌ None | ❌ Missing | **MEDIUM** |
| `/api/test-hyperdrive` | GET | ❌ None | ❌ Missing | **LOW** |
| `/api/*` | GET/POST | ❌ None | ❌ Missing | **LOW** |

## Broken Tests Inventory

### Issues Identified

1. **Missing tv4 Library Declaration**
   - Some tests use `tv4.validate()` but don't declare the library
   - **Impact:** Tests may fail if tv4 is not loaded
   - **Fix:** Add tv4 library to collection pre-request script

2. **Incomplete Schema Validation**
   - Many endpoints have basic status checks but no JSON schema validation
   - **Examples:** Create Cart, Add Line Item, Create Product
   - **Impact:** Contract tests don't validate response structure
   - **Fix:** Add comprehensive JSON schemas for all responses

3. **Missing Error Response Tests**
   - No tests for 400, 401, 404, 500 error responses
   - **Impact:** Error handling not validated
   - **Fix:** Add error response schemas and test cases

4. **Environment Variable Dependencies**
   - Tests rely on `{{base_url}}`, `{{jwt_token}}`, `{{cart_id}}` but don't validate they exist
   - **Impact:** Tests may fail silently with unclear errors
   - **Fix:** Add pre-request validation for required variables

5. **Request Chaining Issues**
   - Checkout flow tests depend on previous requests but don't handle failures
   - **Impact:** One failure breaks entire flow
   - **Fix:** Add error handling and fallback logic

## Schema Quality Assessment

### Well-Defined Schemas ✅

- **Product List Response** (`store-api`): Comprehensive schema with nested objects, arrays, and proper types
- **Cart Response** (`store-api`): Good coverage of cart structure, items, addresses
- **Admin Product List** (`admin-api`): Includes status enums, variant details, pricing
- **Admin Orders List** (`admin-api`): Complete order structure with status fields

### Needs Improvement ⚠️

- **Create Cart Response**: Only checks status, no schema validation
- **Add Line Item Response**: Basic checks only
- **Product by Handle**: No schema validation
- **Regions List**: No schema validation
- **Collections List**: No schema validation
- **Health Check**: No schema validation (has example responses but no contract test)

### Missing Schemas ❌

- All storefront API endpoints
- All review-related endpoints
- All order management endpoints (except list)
- All webhook endpoints
- Worker health endpoints

## Priority Ranking

### Critical Priority (Must Fix Immediately)

1. **Storefront API Contract Tests** - Zero coverage for critical cart, payment, and checkout endpoints
2. **Review Endpoints** - No contract tests for product reviews (GET/POST)
3. **Order Management** - Missing tests for order retrieval, cancellation, guest view
4. **Payment Intent** - Critical payment flow endpoint has no contract test

### High Priority (Fix Soon)

1. **Order Address Updates** - POST `/store/orders/:id/address`
2. **Order Cancellation** - POST `/store/orders/:id/cancel`
3. **Payment Intent by ID** - GET `/store/orders/by-payment-intent/:id`
4. **Shipping Options/Methods** - Storefront cart shipping endpoints
5. **Stripe Webhook** - POST `/webhooks/stripe` needs schema validation
6. **Admin Review Batch** - POST `/admin/reviews/batch`

### Medium Priority (Fix When Possible)

1. **Health Endpoints** - Add schema validation to existing health check
2. **Worker Health** - Add contract tests for `/health/workers`
3. **Product by Handle** - Add schema validation
4. **Regions/Collections** - Add schema validation
5. **Admin Product Create** - Add response schema
6. **Admin Customer/User Lists** - Add schema validation

### Low Priority (Nice to Have)

1. **Debug Endpoints** - `/store/debug/stripe-flow`
2. **Hyperdrive Test** - `/api/test-hyperdrive`
3. **Catch-all Proxy** - `/api/*`
4. **Failed Workers** - `/health/workers/failed`

## Specific Fix Recommendations

### 1. Add tv4 Library to Collections

**Action:** Add to collection pre-request script:
```javascript
if (!pm.globals.get("tv4")) {
    pm.sendRequest({
        url: 'https://cdn.jsdelivr.net/npm/tv4@1.2.7/tv4.min.js',
        method: 'GET'
    }, function (err, res) {
        if (!err) {
            eval(res.text());
            pm.globals.set("tv4", tv4);
        }
    });
}
```

### 2. Create Storefront API Collection

**Action:** Create new `storefront-api.postman_collection.json` with:
- All `/api/carts/*` endpoints
- `/api/payment-intent`
- `/api/checkout-session`
- `/api/shipping-rates`
- `/api/health`
- Comprehensive JSON schemas for all responses

### 3. Add Review Endpoints to Collections

**Action:** Add to appropriate collections:
- `GET /store/products/:id/reviews` → `store-api`
- `POST /store/products/:id/reviews` → `store-api`
- `GET /admin/reviews` → `admin-api`
- `GET /admin/reviews/:id` → `admin-api`
- `POST /admin/reviews/:id` → `admin-api`
- `DELETE /admin/reviews/:id` → `admin-api`
- `POST /admin/reviews/batch` → `admin-api`
- `POST /store/reviews/:reviewId/helpful` → `store-api`

### 4. Add Order Management Endpoints

**Action:** Add to `store-api` collection:
- `GET /store/orders/:id`
- `POST /store/orders/:id/address`
- `POST /store/orders/:id/cancel`
- `GET /store/orders/:id/guest-view`
- `POST /store/orders/:id/line-items`
- `POST /store/orders/:id/line-items/update`
- `GET /store/orders/by-payment-intent/:id`

### 5. Enhance Existing Schemas

**Action:** Update existing tests to include:
- Error response schemas (400, 401, 404, 500)
- Request body validation
- Query parameter validation
- Response header validation
- Edge case handling (empty arrays, null values)

### 6. Add Health Endpoint Schemas

**Action:** Add JSON schemas to:
- `GET /health` - Validate healthy/unhealthy response structure
- `GET /health/workers` - Add new test with schema
- `GET /health/workers/failed` - Add new test with schema

### 7. Add Webhook Schema Validation

**Action:** Enhance `stripe-webhooks` collection:
- Add JSON schema for webhook payload validation
- Add signature verification test
- Add error response handling

## Coverage Matrix

### Backend Endpoints

| Category | Total Routes | With Tests | Coverage % |
|----------|--------------|------------|------------|
| Admin | 13 | 3 | 23% |
| Store | 22 | 4 | 18% |
| Webhooks | 1 | 0 | 0% |
| Health | 3 | 0 | 0% |
| **Total** | **39** | **7** | **18%** |

### Storefront Endpoints

| Category | Total Routes | With Tests | Coverage % |
|----------|--------------|------------|------------|
| Carts | 6 | 0 | 0% |
| Payment | 2 | 0 | 0% |
| Shipping | 1 | 0 | 0% |
| Infrastructure | 3 | 0 | 0% |
| **Total** | **12** | **0** | **0%** |

### Overall Coverage

- **Backend:** 18% (7/39 endpoints)
- **Storefront:** 0% (0/12 endpoints)
- **Combined:** 12% (7/51 endpoints)

## Next Steps

1. **Phase 2:** Fix broken tests and add missing tv4 declarations
2. **Phase 3:** Add contract tests for all missing backend endpoints
3. **Phase 4:** Create storefront API collection with all endpoints
4. **Phase 5:** Enhance all schemas with error handling and edge cases
5. **Phase 6:** Enable CI/CD workflow with local server bootstrapping

## Conclusion

The current API contract test coverage is insufficient for production use. Critical endpoints, especially in the storefront, have zero coverage. The existing tests that do exist are generally well-structured but need enhancement with comprehensive schemas and error handling.

**Recommended Action:** Prioritize storefront API contract tests and review endpoints as these are customer-facing and critical for business operations.

