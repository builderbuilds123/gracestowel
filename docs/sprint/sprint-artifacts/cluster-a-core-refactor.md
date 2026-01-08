# Agent Task: Execute Cluster A - Checkout Core Refactor

## Objective

Refactor the checkout flow to enforce server-side pricing, fix money unit conversions, and implement the canonical Medusa Cart completion flow.

## 📂 Implementation References

**DO NOT** invent your own plan. **Strictly follow** the steps detailed in these approved artifacts:

1. **[SEC-01: Client-Trust Pricing](./fix-SEC-01-client-trust-pricing.md)**
    * *Focus*: `api.payment-intent.ts`, `create-order-from-stripe.ts`
2. **[MNY-01: Money Units](./fix-MNY-01-money-units.md)**
    * *Focus*: Unit conversion (cents vs major) across all touchpoints.
3. **CHK-02: Payment Collection Integration** *(Supersedes CHK-01)*
    * [CHK-02-A: Backend Payment Collection](./fix-CHK-02-A-backend-payment-collection.md) ✅ Done
    * [CHK-02-B: Storefront Payment UI](./fix-CHK-02-B-storefront-payment-ui.md)
    * [CHK-02-C: Order Completion Flow](./fix-CHK-02-C-order-completion-flow.md)

## 📊 Sprint Status Tracking

* **File**: `[sprint-status.yaml](./sprint-status.yaml)`
* **Instruction**:
  * At the start: Mark these 3 stories as `in_progress`.
  * At completion: Mark them as `completed`.

## 🛑 Autonomous Execution Protocol & Checkpoints

You are an autonomous agent. **Do not stop** to notify the user until the very end. However, you MUST perform these self-checks to ensure you do not hallucinate or drift:

### Phase 1: Context Loading & Validation

1. **Read**: Load the 3 implementation plans and `sprint-status.yaml`.
2. **Update Status**: Mark the 3 stories as `in_progress` in `sprint-status.yaml`.
3. **Self-Check**: Before writing code, verify you have identified the *exact* lines in `api.payment-intent.ts` that erroneously use `req.body.amount`. If you cannot find them, **STOP** and re-read the files.

### Phase 2: Storefront Implementation (Storefront API & UI)

1. **Refactor**: Execute changes in `apps/storefront` based on SEC-01 and CHK-02-A/B/C.
2. **Self-Correction**: Check your changes to `api.payment-intent.ts`. Did you multiply by 100? (MNY-01).
    * *Check*: `cart.total` (major) * 100 = cents.
    * *Correction*: If you missed this, fix it immediately before proceeding.

### Phase 3: Backend Implementation (Workflows)

1. **Refactor**: Execute changes in `apps/backend` based on SEC-01.
2. **Self-Correction**: Check `create-order-from-stripe.ts`. Does it *still* read `metadata.price`?
    * *Check*: Ensure `prepareOrderDataStep` now fetches the Medusa Cart.
    * *Correction*: If it still uses metadata prices, you failed SEC-01. Refactor again.

### Phase 4: Verification & Close

1. **Verify**: Run the verification steps listed in the implementation plans (e.g., unit tests or logic verifications).
2. **Document**: Create `docs/changelogs/cluster-a-decisions.md` and log your architectural decisions.
3. **Finalize**: Update `sprint-status.yaml` to `completed`.
4. **Completion**: **Now** you may stop and notify the user that the task is done.

## 🛡️ Scope Containment & Safety

* **Allowed Files**: Strict read/write access is limited to `apps/storefront/app/routes/*`, `apps/backend/src/workflows/*`, and `apps/backend/src/workers/*`.
* **No-Go Zones**: Do **NOT** modify core configuration files (`medusa-config.js`, `package.json`) unless explicitly instructed.
* **Dependency Rule**: Do not install new npm packages. Use existing libraries only.

## 🌪️ Error Handling & Resilience

Since you are working asynchronously:

1. **Test Failures**: If a verification step fails, attempt to fix it up to **3 times**.
2. **Critical Failure**: If you cannot resolve a `Critical` issue (e.g., security pricing bypass), **STOP** and write a `FAILURE_REPORT.md` with your analysis.
3. **Non-Critical Failure**: If a minor edge case fails, document it in `docs/sprint/issues-log.md` and proceed, but mark the story as `blocked` in sprint status.

## 🧠 Visibility & Traceability

To help us understand your async decisions:

* **AI Comments**: For complex logic changes (especially the MNY-01 math), add comments like:

    ```typescript
    // AI-NOTE: Converted major units (50.00) to cents (5000) for Stripe. Reference: MNY-01.
    ```

* **Changelog**: Keep the `docs/changelogs/cluster-a-decisions.md` updated in real-time as you make decisions, not just at the end.

## Key Files to Watch
* `apps/storefront/app/routes/api.payment-intent.ts`
* `apps/backend/src/workflows/create-order-from-stripe.ts`
* `apps/storefront/app/routes/checkout.tsx`
* `apps/backend/src/workers/payment-capture-worker.ts`
