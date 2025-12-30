# Delegation Strategy: Checkout Audit Fixes

To accelerate the remediation of the checkout flow, tasks have been grouped into **Lanes** based on file overlaps and logical dependencies. This minimizes merge conflicts and ensures architectural consistency.

## 🏎️ Lane 1: Order Integrity (The Critical Path)
**Agent Persona:** "The Architect"
**Focus:** Core payment logic, data integrity, and canonical Medusa patterns.
**Constraint:** These tasks heavily modify `create-order-from-stripe.ts` and `api.payment-intent.ts`. They **MUST** be executed by a single agent (or strictly serialized) to prevent massive conflicts.

### Recommended PR Strategy: "The 3 Clusters"
Don't do 1 massive PR (hard to review) or 8 tiny ones (hard to manage dependencies). Use **3 Logical Clusters**:

#### 📦 Cluster A: The Core Refactor (Foundation)
*Goal: Switch source of truth to Medusa Cart & ensure correct math.*
*   **[SEC-01] Client-Trust Pricing** (The main refactor)
*   **[MNY-01] Money Units** (Fix math while refactoring)
*   **[CHK-01] Canonical Checkout** (Ensure Cart completes)
*   *Why combine?* You cannot simply "trust the server" (SEC-01) without fixing the units (MNY-01) and ensuring the cart flows correctly (CHK-01). They modify the exact same lines.

#### 💳 Cluster B: Payment Architecture
*Goal: Align with Medusa's Payment Module.*
*   **[PAY-01] Payment Status Model** (Implement PaymentCollections)
*   **[REL-01] Idempotency Key** (Fix key generation)
*   *Why combine?* Builds on top of the clean data flow from Cluster A.

#### 🛒 Cluster C: Order Enrichment & Side Effects
*Goal: Fix specific data attributes and side-effects.*
*   **[INV-01] Inventory Decrement** (Atomic operations)
*   **[SHP-01] Shipping Options** (Persist IDs)
*   **[TAX-01] End-to-End Tax** (Tax lines)
*   *Why combine?* These are distinct isolated fixes within the workflow that can be verified independently once the core flow breaks less things.

---

## 🛡️ Lane 2: Security & Async Operations (Parallelizable)
**Agent Persona:** "The Warden"
**Focus:** Security hardening, edge-case handling, and asynchronous workers.
**Constraint:** Low overlap with Lane 1. Can run **immediately in parallel**.

*   **[SEC-02] Unsafe Order Endpoint** (Fix PII leak in query)
*   **[SEC-03] Token Expiry Anchoring** (Fix token validity window)
*   **[SEC-04] Client Secret Leak** (Fix Referrer header leak)
*   **[SEC-05] LocalStorage Token** (Fix XSS risk in storage)
*   **[CONC-01] Edit Status Locking** (Fix race conditions in capture)
*   **[FUL-01] Fulfillment Tracking** (Fix tracking number sync)
*   **[RET-01] Returns & Refunds** (Fix refund workflow integration)

---

## 🛠️ Lane 3: Order Modifications (Dependent)
**Agent Persona:** "The Modifier"
**Focus:** Post-order user actions and UX improvements.
**Constraint:** Strongly depends on the data models established in **Lane 1** (specifically SEC-01 and PAY-01).
*   **Recommendation:** Start after Lane 1 reaches "Code Review" phase, OR mock the dependencies.

*   **[ORD-01] Add Items Workflow** (Needs Payment Collections from PAY-01)
*   **[ORD-02] Post-Auth Amount** (Needs Payment Collections from PAY-01)
*   **[ORD-03] Address Update Token** (Fix token transport)
*   **[UX-01] Cart Quantity UX** (Storefront UI fix - Low conflict, can be pulled to Lane 2 if desired)
*   **[PERF-01] Stock Validation** (Perf optimization - Low conflict)

## Summary of Parallelization

| Agent | Tasks | Files Touched (Primary) | Dependency |
| :--- | :--- | :--- | :--- |
| **Agent A** | Lane 1 (8 tasks) | `create-order-from-stripe.ts`, `api.payment-intent.ts`, `checkout.tsx` | None |
| **Agent B** | Lane 2 (7 tasks) | `orders/route.ts`, `capture-worker.ts`, `checkout.success.tsx` | None (Independent) |
| **Agent C** | Lane 3 (5 tasks) | `add-item-to-order.ts`, `update-line-item.ts`, `CartContext.tsx` | Waits for Agent A (mostly) |
