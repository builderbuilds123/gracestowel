# Story 0.1: Establish Medusa Client & Hyperdrive Connection

**Epic:** [Epic 0: Architecture & Data Foundation](../epics.md#epic-0-architecture-data-foundation)
**Status:** review
**Sprint:** Phase 4 Implementation
**Feature:** Dynamic Content Pivot
**Source:** [Sprint Change Proposal](../sprint-change-proposal-2025-12-05.md)

## User Story
**As a** developer,
**I want** to configure the Medusa JS client and Cloudflare Hyperdrive in the storefront,
**So that** I can securely and performantly fetch data from the Medusa backend.

## Acceptance Criteria
- [x] **Medusa JS Client Initialized:** The Medusa JS client is correctly initialized with the backend URL in a type-safe manner.
- [x] **Hyperdrive Configured:** `wrangler.toml` contains the correct Hyperdrive binding configuration for both local (`wrangler.toml`) and production environments.
- [x] **Environment Variables:** `MEDUSA_BACKEND_URL` and `PUBLISHABLE_API_KEY` are accessible to the client.
- [x] **Loader Integration:** The Hyperdrive connection string is correctly passed to the Postgres client (if direct DB access is needed) OR the Medusa client is configured to work within the Cloudflare Worker context.
    - *Clarification:* Typically Medusa Client calls the API, which uses the DB. Hyperdrive is for when the *Storefront* needs direct DB access (e.g. for super fast reads bypass). If this story implies just API access, Medusa Client is enough. However, the requirement explicitly mentions **Hyperdrive**. This implies the Storefront might need direct DB access for read-heavy operations or the "Single Source of Truth" pivot.
    - *Refined AC:* Verify Hyperdrive binding is present and usable, even if primary data fetching is via Medusa Client API.
- [x] **Verification:** A simple "Ping" or "List Products" call works from a Storefront loader.

## Context & Resources
[Content Unchanged]

## Dev Agent Record (AI)

### Debug Log
- Unit test for `createMedusaClient` initially failed due to missing `@medusajs/js-sdk`. Installed package.
- `npm run typecheck` failed due to missing `MEDUSA_BACKEND_URL` in `Env` (worker-configuration.d.ts). Fixed by adding vars to `wrangler.jsonc` and allowing `wrangler types` to regenerate.
- Regression detected in `medusa.ts`: Original file content (types/helpers) was overwritten. Restored original content and merged new factory function.
- `search.tsx` errors resolved after restoring `medusa.ts`.

### Completion Notes
- **Implemented:**
  - `wrangler.jsonc`: Added Hyperdrive binding and required environment variables.
  - `app/lib/medusa.ts`: Added `createMedusaClient` factory while preserving existing types.
  - `app/root.tsx`: Added loader check to verify environment variables are accessible in Cloudflare context.
  - `app/lib/medusa.test.ts`: Added unit test for client factory.
- **Verification:**
  - `npm run test` passed for new test.
  - `npm run typecheck` passed for relevant files (`search.tsx`, `medusa.ts`).
  - Remaining type errors in PDP (`products.$handle.tsx`) are pre-existing and related to Story 0.2.

## File List
- apps/storefront/wrangler.jsonc
- apps/storefront/app/lib/medusa.ts
- apps/storefront/app/lib/medusa.test.ts
- apps/storefront/app/root.tsx
- apps/storefront/package.json
- apps/storefront/worker-configuration.d.ts

## Change Log
- 2025-12-05: Initial implementation of Story 0.1 (Medusa Client & Hyperdrive)
- 2025-12-05: Code Review passed. Fixed missing `jsdom` in tests, removed dead code in `root.tsx`, and secured `MEDUSA_PUBLISHABLE_KEY` in `.dev.vars`.
- 2025-12-06: **Amelia Code Review & Fixes** (Automated)
  - Fixed `root.tsx` to verify Medusa connection via loader ping.
  - Fixed `wrangler.jsonc` duplicate keys.
  - Added comprehensive tests for `getMedusaClient` and global env hydration.
  - Implemented `window.ENV` hydration for robust client-side usage.

