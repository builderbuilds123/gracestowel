# Agent Task: Review Cluster A - Checkout Core Refactor

## Objective

Act as a **Senior Security Auditor**. Review the changes made to the checkout flow to ensure **SEC-01** (Client Trust), **MNY-01** (Money Units), and **CHK-02** (Payment Collection) are implemented correctly.

## 📂 Implementation Context

The implementation agent was tasked with:

1. **SEC-01**: Removing client-side price trust.
2. **MNY-01**: Fixing major (Medusa) to minor (Stripe) unit conversion.
3. **CHK-02**: Implementing Payment Collection flow via Medusa (supersedes CHK-01).

## 🕵️ Review Checklist (Pass/Fail)

### 1. Security Audit (SEC-01) - `api.payment-intent.ts`

- [ ] **FAIL** if `amount` is read from `req.body` and used for anything other than logging.
- [ ] **FAIL** if `items` are read from `req.body` and used to calculate the total.
- [ ] **PASS** only if the Medusa Cart is fetched server-side using `cartId`.
- [ ] **PASS** only if the Stripe PaymentIntent `amount` is derived directly from `cart.total` (plus server-side shipping calc).

### 2. Money Unit Audit (MNY-01) - All Files

- [ ] **FAIL** if you see double multiplication (e.g., `amount * 100 * 100`).
- [ ] **FAIL** if `cart.total` (which is usually major units in v2, e.g., 50.00) is passed directly to Stripe without converting to cents (5000).
- [ ] **PASS** if there is exactly **one** explicit conversion step, ideally commented with `// AI-NOTE`.

### 3. Workflow Audit - `create-order-from-stripe.ts`

- [ ] **FAIL** if `prepareOrderDataStep` reads `unit_price` from `metadata`.
- [ ] **PASS** if it fetches the Cart (or Order) from the DB and uses those line items.

### 4. Architecture Audit (CHK-02) - `checkout.tsx`

- [ ] **PASS** if Payment Collection is created before payment.
- [ ] **PASS** if `medusa.carts.complete()` is called after Stripe confirmation.

## 📝 Output Format

Provide your review as a **Markdown Report**:

1. **Status**: `APPROVED` / `REQUEST_CHANGES`
2. **Critical Issues**: Any finding that triggers a "FAIL" condition above.
3. **Math Verification**: Explicitly state: "I verified that $10.00 becomes 1000 cents."
4. **Code Snippets**: Quote the lines of code that prove the fix works (or fails).

## Key Files to Scan

- `apps/storefront/app/routes/api.payment-intent.ts`
- `apps/backend/src/workflows/create-order-from-stripe.ts`
- `apps/storefront/app/routes/checkout.tsx`
