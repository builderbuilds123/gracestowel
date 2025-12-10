# Validation Report

**Document:** docs/sprint/sprint-artifacts/4-3-session-persistence.md  
**Checklist:** .bmad/bmm/workflows/4-implementation/create-story/checklist.md  
**Date:** 2025-12-09T13:45:00Z

## Summary
- Overall: 2/9 passed (22%)
- Critical Issues: 3
- Partial Coverage: 4
- Not Met: 3

## Section Results

### Source Intelligence (1/3 passed)
- [✓ PASS] **Epic 4 alignment & dependencies referenced.** Story 4.3 reiterates the shopper scenario and explicitly points back to Story 4.2 in the References block, keeping the same loader (`order_.status.$id.tsx`) in scope.
- [⚠ PARTIAL] **Architecture & security constraints captured.** Cookie attributes (`httpOnly`, `secure`, `sameSite="strict"`) are captured, but the plan hardcodes `maxAge: 3600` in `createCookieSessionStorage` without syncing to the remaining Redis TTL, and never mentions the PRD mandate to store both `order_id` and token (`docs/prd/payment-integration.md`, §4.3). No note about signing the cookie with the same secret as Redis payloads.
- [⚠ PARTIAL] **Previous story intelligence reused.** Story links to 4.2 but never states how to reuse `GuestAccessService.validateToken` or the middleware added there; loader steps only say "Check URL token" then "Else Check Cookie", flipping the Epic 4.3 requirement that middleware should prefer the cookie first.

### Disaster Prevention (1/5 passed)
- [✗ FAIL] **Reinvention / reuse plan.** Tasks propose a brand-new `guest-session.server.ts` session store without reusing the Redis-backed token service introduced in Stories 4.1/4.2, risking duplicate token authorities and inconsistent TTL enforcement (Epic 4 acceptance criteria & Architecture Backend doc).
- [✗ FAIL] **Technical specification completeness.** Hard-coding `maxAge: 3600` effectively refreshes the window to a full hour on every new cookie even if the Redis token has 5 minutes left, violating "cookie expiry must match the token TTL (remaining time or flat 1 hour)" (Story 4.3 acceptance criteria). The plan never scopes cookies per `order_id`, contradicting PRD §4.3, and it allows loaders to trust a cookie without backend revalidation.
- [✓ PASS] **File structure impact.** Story explicitly lists the Remix utility file (`app/utils/guest-session.server.ts`) plus loader & action files so devs know exactly where to work.
- [✗ FAIL] **Regression safeguards & invalidation.** No acceptance criteria or tasks require automated tests (Playwright/loader unit tests) or outline how to clear the cookie when backend validation fails, leaving high risk of users stuck in an expired state. Epic 5 (QA) calls for automated verification of grace-period behavior, but this story provides none.
- [⚠ PARTIAL] **Implementation clarity.** Steps outline loader logic but skip multiple-order handling, cross-tab behavior, and how the actions will locate the correct header when multiple edit windows overlap. Notes admit "Single token usually fine for MVP" without a requirement, leaving ambiguity.

### LLM Optimization (0/1 passed)
- [⚠ PARTIAL] **LLM-ready structure & density.** Document keeps standard Create-Story template but leaves `Dev Agent Record` empty and lacks scannable sub-headings for edge cases, forcing the dev agent to infer missing context.

## Failed Items
1. **Reinvention / reuse plan** – Needs explicit direction to use existing `GuestAccessService` + Redis TTL instead of new token authority.
2. **Technical specification completeness** – Must align cookie TTL/order binding and enforce backend validation before trust.
3. **Regression safeguards & invalidation** – Requires tests plus cookie-clearing rules tied to backend responses.

## Partial Items
- Architecture & security constraints
- Previous story intelligence reuse
- Implementation clarity
- LLM optimization & structure

## Recommendations
1. **Must Fix (Critical)**
   - Bind the session cookie to `{order_id, token}` and set `maxAge`/`expires` based on the Redis TTL returned by `GuestAccessService.validateToken`; clear cookie immediately when backend responds 401.
   - Reorder loader logic to check signed cookie first, then fall back to URL token, and always revalidate with backend before granting edit rights.
   - Reuse the existing Redis token service instead of inventing a parallel cookie store; document how the cookie merely mirrors Redis state.
2. **Should Improve (Enhancements)**
   - Describe backend contract updates (e.g., `x-guest-token` header format, middleware reuse) and how actions will propagate tokens through Medusa API calls.
   - Add acceptance criteria for automated Remix loader/action tests plus an integration test proving the cookie blocks access after expiry.
   - Specify behavior for multiple concurrent orders or multiple browser tabs so developers don't implement conflicting storage keys.
3. **Consider (Optimizations)**
   - Provide sample pseudocode for `guest-session.server.ts` (commitSession/getSession helpers) so dev agents can implement quickly.
   - Fill in the Dev Agent Record with the intended LLM model, context references, and TODO list to improve downstream clarity.
