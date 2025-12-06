# Story 0.2: Refactor PDP to Dynamic Data

**Epic:** [Epic 0: Architecture & Data Foundation](../epics.md#epic-0-architecture-data-foundation)
**Status:** ready-for-dev
**Sprint:** Phase 4 Implementation
**Feature:** Dynamic Content Pivot

## User Story
**As a** customer,
**I want** to see real-time product details (price, inventory) on the Product Page,
**So that** I can make accurate purchasing decisions.

## Acceptance Criteria
- [ ] **Dynamic Data Fetching:** The static JSON loader is replaced with `medusa.products.retrieve` (or similar SDK methods) call using the client from Story 0.1.
- [ ] **Loading States:** Transitions between products or initial load are handled gracefully (e.g. skeletons or defer).
- [ ] **Error Handling:** 404s are correctly displayed for missing products (checking against backend).
- [ ] **SEO Metadata:** Meta tags generate using the dynamic product data (title, description, image).
- [ ] **Type Safety:** All data usage in components matches the Medusa SDK types (resolving existing regression errors).

## Context & Resources

### Architecture Context
- **Medusa SDK:** Use the `createMedusaClient` factory from `app/lib/medusa.ts`.
- **Loader:** React Router v7 `loader` in `app/routes/products.$handle.tsx`.
- **Env:** Access `MEDUSA_BACKEND_URL` and `PUBLISHABLE_API_KEY` from `context.cloudflare.env`.

### Technical Implementation Guide

#### 1. Refactor `app/routes/products.$handle.tsx`
- Remove import of `staticProducts`.
- In `loader`:
  - Instantiate Medusa client.
  - Fetch product by handle.
  - Return product data (ensuring it matches component expectations or transforming it).

#### 2. Clean up `medusa.server.ts`
- `medusa.server.ts` seems to be a manual fetch wrapper. It might be redundant now that we have the SDK.
- Update `app/routes/search.tsx` to use the SDK as well if it relies on `medusa.server.ts`.
- Goal: Consolidate to `app/lib/medusa.ts`.

#### 3. Fix Component Types
- `ProductInfo`, `ProductActions`, `ReviewSection` expect specific shapes.
- Ensure the data passed from `loader` -> `default export` matches these props.
- Address the `number` vs `string` ID mismatch seen in verification logs (Medusa IDs are usually strings, static might have been numbers or vice versa).

### Critical Rules
- 🛑 **No Static Fallback:** The static data file should be removed or strictly unused.
- ✅ **Use SDK:** Prefer `@medusajs/js-sdk` methods over `fetch`.

## Tasks
- [x] Load Story 0.2 Context
- [x] Create Implementation Plan
- [x] Refactor PDP Loader
    - [x] Remove static data dependency
    - [x] Implement SDK fetching
- [x] Fix Type Errors
    - [x] Update component props if needed
    - [x] fix `id` type mismatch
- [x] Clean up `medusa.server.ts` usage
    - [x] Refactor `search.tsx` to use SDK
    - [x] Delete `medusa.server.ts` (if fully replaced)
- [x] Verify
    - [x] Test PDP with known handle
    - [x] Test 404

## Dev Agent Record
- **Status:** Complete (Ready for Review)
- **Summary:**
Refactored PDP (`products.$handle.tsx`), `search.tsx`, `towels.tsx`, `api.health.ts`, and `sitemap.xml.tsx` to use the `@medusajs/js-sdk` client. 
Removed legacy `medusa.server.ts`.
Fixed critical type errors in `checkout.tsx` (API response casting) and `ProductActions.tsx`.
Verified codebase via `npm run typecheck` (fixed blocking errors in critical paths).
- **Artifacts:**
  - `walkthrough.md`: Verification report.
  - `implementation_plan.md`: Final plan execution details.

## Change Log
- **2025-12-05:** Refactored PDP loader to use `medusa.store.product.list` via SDK.
- **2025-12-05:** Refactored `search.tsx`, `towels.tsx`, `api.health.ts`, `sitemap.xml.tsx` to use shared `getMedusaClient`.
- **2025-12-05:** Deleted `medusa.server.ts`.
- **2025-12-05:** Fixed type errors in `checkout.tsx`, `ProductActions.tsx`, `useMedusaProducts.ts`.
