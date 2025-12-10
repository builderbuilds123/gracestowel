# Sprint Change Proposal: Static to Dynamic Medusa Pivot
**Date:** 2025-12-05
**Author:** Tea (Analyst Agent)
**Status:** APPROVED

## 1. Issue Summary
**Trigger:** Strategic technical pivot identified during implementation planning.
**Context:** The storefront is currently operating with static content. To support required features (PostHog User IDs, Transparent Pricing Breakdown, Real-time Inventory), it must transition to using the Medusa v2 backend as the "single source of truth."
**Problem:** Continuing with static content will block Epic 1 (PostHog), Epic 4 (Transparent Pricing), and create significant technical debt.

## 2. Impact Analysis
### Epic Impact
*   **Epic 0: Architecture & Data Foundation (NEW):** Created to track this foundational work. High priority.
*   **Epic 1 (PostHog):** Blocked. Requires real `product.id` and `customer.id` from Medusa to track meaningful events.
*   **Epic 4 (Transparent Pricing):** Blocked. Dynamic cost calculation requires real-time data from the backend.
*   **Cookie Policy:** Low impact. Can be implemented independently but should ideally respect the new architecture.

### Artifact Conflicts
*   **Epics:** `epics.md` updated to include Epic 0.
*   **Architecture:** `architecture.md` already specifies this pattern (Medusa + Hyperdrive), so this change **aligns** the implementation with the approved architecture.

### Technical Impact
*   **Storefront:** Major refactor of all Loaders (Product, Collection, Cart).
*   **Infrastructure:** Cloudflare Hyperdrive configuration required.

## 3. Recommended Approach & Rationale
**Selected Path:** Option 1: Direct Adjustment (Add Epic 0)
**Rationale:**
*   **Alignment:** Brings codebase into alignment with the approved Architecture documentation.
*   **Necessity:** This is a hard prerequisite for 80% of the planned features.
*   **Timing:** Doing this now prevents wasted effort building "fake" features on static data.

## 4. Detailed Change Proposals
### Epic 0: Architecture & Data Foundation
(Added to `epics.md`)
*   **Story 0.1:** Connect Medusa JS Client & Hyperdrive.
*   **Story 0.2:** Refactor PDP to use `medusa.products.retrieve`.

## 5. Implementation Handoff
**Scope Classification:** **Major** (Foundational Architecture Change)
**Handoff Plan:**
*   **Roles:**
    *   **Developer:** Execute Story 0.1 and 0.2 immediately.
    *   **Architect:** Verify Hyperdrive performance and security.
*   **Success Criteria:** Storefront PDP loads dynamic data from Railway-hosted Medusa backend via Cloudflare Hyperdrive.

---
**Approval:**
[x] Approved
[ ] Needs Revision
