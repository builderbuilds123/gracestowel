# Agent Task: Execute Cluster B - Payment Architecture

## Objective
Refactor the order measurement and payment models to align with Medusa v2's canonical architecture.
**Scope**: `PAY-01` (Payment Status Model), `REL-01` (Idempotency Key).

## 📂 Implementation References
**Strictly follow** these approved artifacts:
1.  **[PAY-01: Payment Status Model](./fix-PAY-01-payment-status-model.md)**
    *   *Focus*: `create-order-from-stripe.ts`, `payment-capture-worker.ts`.
    *   *Goal*: Stop using `metadata.payment_status`. Use real `PaymentCollection`, `Payment`, and `OrderTransaction` records.
2.  **[REL-01: Idempotency Key](./fix-REL-01-idempotency-key.md)**
    *   *Focus*: `api.payment-intent.ts`.
    *   *Goal*: Deterministic key generation (remove `Math.random()`).

## 📊 Sprint Status Tracking
*   **File**: `[sprint-status.yaml](./sprint-status.yaml)`
*   **Instruction**:
    *   Start: Mark `fix-PAY-01` and `fix-REL-01` as `in_progress`.
    *   End: Mark them as `completed`.

## 🛑 Autonomous Execution Protocol & Checkpoints

### Phase 1: Context & Plan
1.  **Read**: Load `fix-PAY-01-payment-status-model.md` and `fix-REL-01-idempotency-key.md`.
2.  **Analysis**: Identify where `metadata.payment_status` is currently written (likely `payment-capture-worker.ts` lines 285-293).
3.  **Self-Check**: Do you see where `Math.random()` is used in `api.payment-intent.ts`? If not, stop.

### Phase 2: Idempotency (REL-01)
1.  **Refactor**: Modify `generateIdempotencyKey` in `api.payment-intent.ts`.
2.  **Rule**: Use `hash(cartId + amount + currency)`. It must be stable for the same cart/amount.

### Phase 3: Payment Model (PAY-01)
1.  **Workflow**: In `create-order-from-stripe.ts`, ensure a `PaymentCollection` is created/linked.
2.  **Worker**: In `payment-capture-worker.ts`, replace metadata updates with `paymentModuleService.capturePayment(paymentId)`.
3.  **Transactions**: Ensure an Order Transaction is created reflecting the capture.

### Phase 4: Verification & Close
1.  **Verify**: Run the verification steps from the plans.
2.  **Document**: Create `docs/changelogs/cluster-b-decisions.md`.
3.  **Finalize**: Update `sprint-status.yaml` and notify.

## 🛡️ Safety & Visibility
*   **No-Go**: Do not modify the Order Module core definitions, only how we interact with them.
*   **AI Comments**: Tag complex payment logic with `// AI-NOTE: PAY-01`.

## Key Files to Watch
- `apps/backend/src/workers/payment-capture-worker.ts`
- `apps/backend/src/workflows/create-order-from-stripe.ts`
- `apps/storefront/app/routes/api.payment-intent.ts`
