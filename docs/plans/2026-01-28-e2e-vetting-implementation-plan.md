# E2E Vetting & Critical Path Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Identify business‑critical E2E coverage, fix the critical tests, and remove redundant E2E specs.

**Architecture:** Keep a small, deterministic E2E suite focused on checkout, promo codes, order modification/cancellation, and payment capture. Use data factories for seeding and standardize on fixtures to reduce flake. Remove non‑critical or redundant specs.

**Tech Stack:** Playwright, Medusa v2 API, Stripe test mode, pnpm

---

### Task 1: Produce the classification report

**Files:**
- Read: `apps/e2e/tests/*.spec.ts`
- Read: `apps/e2e/tests/storefront/*.spec.ts`
- Read: `apps/e2e/tests/backend/*.spec.ts`

**Step 1: Catalog all E2E specs**

List all spec files and a one‑line summary of coverage.

**Step 2: Map to critical paths**

Label each spec as:
- Critical (covers checkout / fulfill & capture / promo codes / order modification / order cancellation / payment capture job)
- Redundant (overlaps with another critical spec)
- Non‑critical (nice‑to‑have)

**Step 3: Report**

Write a short report in the response (not a file) with:
- Critical coverage list
- Redundant list
- Missing coverage (if any)

---

### Task 2: Fix promo‑code E2E (critical)

**Files:**
- Modify: `apps/e2e/tests/storefront/promotions.spec.ts`
- Reference: `apps/e2e/support/fixtures/index.ts`
- Reference: `apps/e2e/support/factories/discount-factory-class.ts`

**Step 1: Write failing test (remove describe.skip)**

Switch to shared fixtures and add deterministic promotion creation with `discountFactory.createDiscount`.

**Step 2: Run test to verify it fails**

Run: `cd apps/e2e && pnpm test -- promotions.spec.ts`
Expected: FAIL (until selectors/waits are adjusted)

**Step 3: Make it deterministic**

- Ensure product exists via `productFactory`
- Apply promo via UI
- Assert promo badge or discount row

**Step 4: Re‑run test to verify it passes**

Run: `cd apps/e2e && pnpm test -- promotions.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/e2e/tests/storefront/promotions.spec.ts
git commit -m "test(e2e): make promotions flow deterministic"
```

---

### Task 3: Fix order modification / cancellation / capture job E2E (critical)

**Files:**
- Modify: `apps/e2e/tests/grace-period.spec.ts`
- Reference: `apps/e2e/support/factories/order-factory-class.ts`
- Reference: `apps/e2e/support/helpers/api-request.ts`

**Step 1: Write failing test changes**

Refactor to seed a fresh order using `orderFactory` and generate tokens internally (no external env dependency).

**Step 2: Run targeted tests**

Run: `cd apps/e2e && pnpm test -- grace-period.spec.ts`
Expected: FAIL until seeding/token logic is stable.

**Step 3: Stabilize**

- Replace `TEST_ORDER_ID`/`TEST_TOKEN` env reliance with factory‑created order
- Keep only essential tests: edit button visibility, cancel hidden after expiry, capture job smoke
- Remove or mark legacy token tests as non‑critical (delete or skip)

**Step 4: Re‑run**

Run: `cd apps/e2e && pnpm test -- grace-period.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/e2e/tests/grace-period.spec.ts
git commit -m "test(e2e): stabilize grace period critical flows"
```

---

### Task 4: Fix checkout flow E2E (critical)

**Files:**
- Modify: `apps/e2e/tests/full-checkout.happy.spec.ts` OR `apps/e2e/tests/checkout.spec.ts`
- Reference: `apps/e2e/support/fixtures/index.ts`

**Step 1: Decide canonical checkout spec**

Choose one spec as the canonical checkout flow. Remove the other to eliminate overlap.

**Step 2: Make the canonical test deterministic**

- Use `productFactory` for a stable product
- Avoid mocked Stripe routes if backend is configured
- If Stripe is unstable, assert up to payment element instead of final success

**Step 3: Run test**

Run: `cd apps/e2e && pnpm test -- <chosen-spec>.spec.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/e2e/tests/<chosen-spec>.spec.ts
git commit -m "test(e2e): stabilize checkout critical flow"
```

---

### Task 5: Remove redundant/non‑critical specs

**Files:**
- Delete: redundant specs (to be confirmed in report)

**Step 1: Delete files**

Remove non‑critical specs after confirmation.

**Step 2: Run quick smoke**

Run: `cd apps/e2e && pnpm test -- --project=chromium`
Expected: PASS (only remaining critical specs)

**Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): remove redundant specs"
```

---

### Task 6: Documentation update

**Files:**
- Modify: `docs/guides/testing.md`

**Step 1: Update E2E section**

List the remaining critical specs and remove references to deleted ones.

**Step 2: Commit**

```bash
git add docs/guides/testing.md
git commit -m "docs: update e2e critical suite"
```

